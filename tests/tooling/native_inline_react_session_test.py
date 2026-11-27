"""Session controls only: no display, GTK host, system manager, SSH or VM runs."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/native-inline-react-v1/session.py'
SPEC = importlib.util.spec_from_file_location('inline_session', SCRIPT)
session = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(session)


class SessionControls(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pn-session-control-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'profile'
        self.root.mkdir(mode=0o700)
        files = {}
        for name in ('host', 'session.py', 'observer.py'):
            data = ('fixed-' + name).encode()
            (self.root / name).write_bytes(data)
            (self.root / name).chmod(0o700 if name == 'host' else 0o600)
            files[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        self.manifest = {'version': 1, 'profile': 'inline-react-v1',
                         'native_app_tested': False, 'files': files,
                         'sources': {name: 'a' * 64 for name in session.SOURCES}}
        self.write_manifest()
        self.addCleanup(patch.stopall)
        patch.object(session, 'ROOT', self.root).start()
        patch.object(session, 'UID', os.getuid()).start()

    def write_manifest(self):
        (self.root / 'manifest.json').write_text(json.dumps(self.manifest))
        (self.root / 'manifest.json').chmod(0o600)

    def test_valid_artifacts_and_fresh_private_layout(self):
        with session.Artifacts() as artifacts:
            artifacts.verify()
            session.create_layout(artifacts)
            self.assertEqual(sorted(p.name for p in (self.root / 'run').iterdir()), ['auth', 'evidence'])
            for path in (self.root / 'run').rglob('*'):
                self.assertEqual(path.stat().st_mode & 0o777, 0o700)

    def test_existing_run_refuses_without_reusing_resources(self):
        (self.root / 'run').mkdir(mode=0o700)
        with self.assertRaises(session.Refused):
            with session.Artifacts() as artifacts:
                artifacts.verify()

    def test_artifact_mutation_is_detected_before_launch(self):
        with session.Artifacts() as artifacts:
            (self.root / 'host').write_bytes(b'changed')
            with self.assertRaises(session.Refused):
                artifacts.verify()

    def test_symlink_and_hardlink_and_extra_files_refuse(self):
        for kind in ('symlink', 'hardlink', 'extra'):
            with self.subTest(kind=kind):
                if kind == 'extra':
                    (self.root / 'unexpected').write_bytes(b'x')
                else:
                    target = self.root / 'observer.py'
                    data = target.read_bytes()
                    target.unlink()
                    source = self.root.parent / ('other-' + kind)
                    source.write_bytes(data)
                    source.chmod(0o600)
                    if kind == 'symlink':
                        target.symlink_to(source)
                    else:
                        os.link(source, target)
                with self.assertRaises(session.Refused):
                    with session.Artifacts():
                        pass
                if kind == 'extra':
                    (self.root / 'unexpected').unlink()
                else:
                    (self.root / 'observer.py').unlink()
                    (self.root / 'observer.py').write_bytes(data)
                    (self.root / 'observer.py').chmod(0o600)

    def test_manifest_shape_source_names_and_boolean_sizes_refuse(self):
        changes = [lambda m: m.update(extra=True),
                   lambda m: m['sources'].update({'arbitrary': 'a' * 64}),
                   lambda m: m['files']['host'].update(bytes=True),
                   lambda m: m.update(native_app_tested=True)]
        original = json.dumps(self.manifest)
        for change in changes:
            self.manifest = json.loads(original)
            change(self.manifest)
            self.write_manifest()
            with self.assertRaises(session.Refused):
                with session.Artifacts():
                    pass

    def test_duplicate_json_key_refuses(self):
        (self.root / 'manifest.json').write_text('{"version":1,"version":1}')
        with self.assertRaises(session.Refused):
            with session.Artifacts():
                pass

    def receipt(self, case):
        value = {key: 'passed' for key in session.OBSERVATIONS}
        if case == 'expiry':
            value.update(pointer='not_run', keyboard='not_run', host_input='not_run')
        return dict(version=1, profile='inline-react-v1', case=case,
                    scope='fixed-native-diagnostic-only', native_app_tested=False,
                    status='passed', phase='complete', reason='none', **value)

    def test_stop_and_expiry_receipts_have_distinct_required_fields(self):
        for case in ('stop', 'expiry'):
            session.validate_receipt(self.receipt(case), case)
        bad = self.receipt('expiry')
        bad['pointer'] = 'passed'
        with self.assertRaises(session.Refused):
            session.validate_receipt(bad, 'expiry')
        with self.assertRaises(session.Refused):
            session.validate_receipt(self.receipt('stop'), 'expiry')

    def test_receipts_cannot_pass_on_extra_fields_or_native_claim(self):
        for key, value in [('native_app_tested', True), ('extra', 'x'), ('termination', 'not_run')]:
            receipt = self.receipt('stop')
            receipt[key] = value
            with self.assertRaises(session.Refused):
                session.validate_receipt(receipt, 'stop')

    def test_fixed_x_arguments_and_no_inherited_bus_or_preload(self):
        environment = session.desktop_environment()
        self.assertEqual(environment['DBUS_SESSION_BUS_ADDRESS'], 'unix:path=/run/user/1001/bus')
        self.assertNotIn('LD_PRELOAD', environment)
        argv = session.xvfb_arguments()
        self.assertIn('-auth', argv)
        self.assertEqual(argv[argv.index('-nolisten') + 1], 'tcp')
        self.assertNotIn('-ac', argv)

    def test_failed_stop_never_starts_expiry(self):
        runner = Mock()
        runner.case.side_effect = session.Refused('observer_failed')
        with self.assertRaises(session.Refused):
            session.run_cases(runner)
        runner.case.assert_called_once_with('stop')

    def test_case_order_is_stop_then_expiry(self):
        runner = Mock()
        session.run_cases(runner)
        self.assertEqual([c.args for c in runner.case.call_args_list], [('stop',), ('expiry',)])

    def test_bounded_log_never_writes_past_cap(self):
        path = self.root / 'log'
        with session.Log(path) as log:
            log.write(b'a' * session.LOG_LIMIT)
            with self.assertRaises(session.Refused):
                log.write(b'overflow')
        self.assertEqual(path.stat().st_size, session.LOG_LIMIT)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_identity_replacement_never_signals_foreign_process(self):
        process = Mock(pid=2345)
        process.poll.return_value = None
        owned = session.Owned(process, ('123', 'S'))
        with patch.object(session, 'identity', return_value=('999', 'S')), patch.object(session.os, 'killpg') as kill:
            with self.assertRaises(session.Refused):
                owned.close()
        kill.assert_not_called()

    def runner(self):
        return session.Runner(Mock())

    def test_tool_output_overflow_reaps_only_owned_control_child(self):
        runner = self.runner()
        real_spawn = subprocess.Popen
        children = []
        def spawn(_args, **options):
            child = real_spawn([sys.executable, '-I', '-c',
                                'import os,time;os.write(1,b"x"*70000);time.sleep(10)'], **options)
            children.append(child)
            return child
        with patch.object(session.subprocess, 'Popen', side_effect=spawn):
            with self.assertRaisesRegex(session.Refused, 'output_limit'):
                runner.tool(['/fixed/control'])
        self.assertIsNotNone(children[0].poll())
        runner.close()

    def test_signal_during_spawn_is_recorded_after_child_is_owned_and_reaped(self):
        runner = self.runner()
        real_spawn = subprocess.Popen
        children = []
        def spawn(_args, **options):
            child = real_spawn([sys.executable, '-I', '-c', 'import time;time.sleep(10)'], **options)
            children.append(child)
            session.INTERRUPTED = True
            return child
        try:
            with patch.object(session.subprocess, 'Popen', side_effect=spawn):
                with self.assertRaisesRegex(session.Refused, 'interrupted'):
                    runner.spawn(['/fixed/control'])
            self.assertEqual(len(runner.owned), 1)
            runner.close()
            self.assertIsNotNone(children[0].poll())
        finally:
            session.INTERRUPTED = False

    def test_tool_absolute_timeout_reaps_control_child(self):
        runner = self.runner()
        real_spawn = subprocess.Popen
        children = []
        def spawn(_args, **options):
            child = real_spawn([sys.executable, '-I', '-c', 'import time;time.sleep(10)'], **options)
            children.append(child)
            return child
        with patch.object(session.subprocess, 'Popen', side_effect=spawn):
            with self.assertRaisesRegex(session.Refused, 'deadline'):
                runner.tool(['/fixed/control'], timeout=0.05)
        self.assertIsNotNone(children[0].poll())

    def test_unproven_case_cleanup_is_never_aggregate_cleanup_pass(self):
        runner = self.runner()
        runner.cleanup_failed = True
        with self.assertRaisesRegex(session.Refused, 'cleanup_failed'):
            runner.close()

    def test_expiry_receipt_is_validated_before_host_close(self):
        with session.Artifacts() as artifacts:
            session.create_layout(artifacts)
            runner = session.Runner(artifacts)
            case = self.root / 'run/evidence/expiry'
            real_spawn = subprocess.Popen
            order = []
            def spawn(args, **options):
                if args == [str(self.root / 'host')]:
                    program = ('import pathlib,sys,time;print("HOST_READY",flush=True);'
                               'p=pathlib.Path(sys.argv[1]);'
                               '\nwhile not p.exists(): time.sleep(.005)')
                    return real_spawn([sys.executable, '-I', '-c', program, str(case / 'closed')], **options)
                self.assertEqual(args[-2:], ['--case', 'expiry'])
                program = ('import pathlib,sys;p=pathlib.Path(sys.argv[1]);'
                           '(p/"result.json").write_text(sys.argv[2]);'
                           '(p/"result.json").chmod(0o600);'
                           '(p/"events.jsonl").write_text("{}\\n");'
                           '(p/"events.jsonl").chmod(0o600)')
                return real_spawn([sys.executable, '-I', '-c', program, str(case), json.dumps(self.receipt('expiry'))], **options)
            validate = session.validate_receipt
            def receipt(value, kind):
                validate(value, kind)
                order.append('authenticated-receipt')
            def close_host(_host, _log):
                order.append('host-close')
                (case / 'closed').touch()
            with patch.object(session.subprocess, 'Popen', side_effect=spawn), \
                 patch.object(session, 'validate_receipt', side_effect=receipt), \
                 patch.object(runner, 'close_host', side_effect=close_host), \
                 patch.object(runner, 'unit_cleanup'):
                runner.case('expiry')
            runner.close()
            self.assertEqual(order, ['authenticated-receipt', 'host-close'])

    def test_command_line_refuses_caller_arguments_before_artifact_access(self):
        with patch.object(session, 'Artifacts') as artifacts:
            with self.assertRaises(session.Refused):
                session.main(['--arbitrary'])
        artifacts.assert_not_called()

    def test_replaced_root_cannot_launch_or_write_into_replacement(self):
        with session.Artifacts() as artifacts:
            session.create_layout(artifacts)
            runner = session.Runner(artifacts)
            original = self.root.with_name('retained-original')
            self.root.rename(original)
            self.root.mkdir(mode=0o700)
            with patch.object(session.subprocess, 'Popen') as spawn:
                with self.assertRaises(session.Refused):
                    runner.spawn(['/fixed/control'])
            spawn.assert_not_called()
            self.assertEqual(list(self.root.iterdir()), [])

    def test_replaced_case_directory_refuses_before_subprocess(self):
        with session.Artifacts() as artifacts:
            session.create_layout(artifacts)
            directory = self.root / 'run/evidence/stop'
            directory.rename(directory.with_name('old-stop'))
            directory.mkdir(mode=0o700)
            with patch.object(session.subprocess, 'Popen') as spawn:
                with self.assertRaises(session.Refused):
                    session.Runner(artifacts).spawn(['/fixed/control'])
            spawn.assert_not_called()

    def test_missing_ordinary_manager_refuses_before_gtk_or_desktop(self):
        runner = self.runner()
        node = SimpleNamespace(st_mode=0o140600, st_uid=session.UID)
        with patch.object(session, 'private_directory'), \
             patch.object(session.Path, 'lstat', return_value=node), \
             patch.object(runner, 'tool', return_value=(1, b'offline')) as tool:
            with self.assertRaises(session.Refused):
                runner.preflight()
        tool.assert_called_once_with(['/usr/bin/systemctl', '--user', 'is-system-running'])

    def test_preflight_failure_restores_handlers_and_writes_only_failed_receipt(self):
        previous = {number: signal.getsignal(number) for number in (signal.SIGINT, signal.SIGTERM)}
        old_umask = os.umask(0o077)
        self.addCleanup(os.umask, old_umask)
        with patch.object(session.Runner, 'preflight', side_effect=session.Refused('preflight_refused')), \
             patch.object(session.subprocess, 'Popen') as spawn:
            self.assertEqual(session.main([]), 2)
        spawn.assert_not_called()
        self.assertEqual({number: signal.getsignal(number) for number in previous}, previous)
        value = json.loads((self.root / 'run/session.json').read_text())
        self.assertEqual(value['status'], 'failed')
        self.assertEqual(value['cases'], {'stop': 'not_run', 'expiry': 'not_run'})
        self.assertFalse(value['native_app_tested'])

    def desktop_control(self, samples, xvfb_code=None, xauth_timeout=False):
        (self.root / 'run/auth').mkdir(parents=True, mode=0o700)
        runner = self.runner()
        original_tool = runner.tool
        original_spawn = runner.spawn
        real_popen = subprocess.Popen
        calls = []
        server = Mock()
        server.process.poll.return_value = xvfb_code
        def spawn(argv, **options):
            if argv[0] == '/usr/bin/Xvfb':
                calls.append('xvfb')
                return server
            if argv[0] == '/usr/bin/openbox':
                calls.append('openbox')
                return Mock()
            return original_spawn(argv, **options)
        def tool(argv, **options):
            if argv[0] == '/usr/bin/xauth':
                if xauth_timeout:
                    raise session.Refused('deadline')
                (self.root / 'run/auth/Xauthority').write_bytes(b'owned-cookie-control')
                return 0, b''
            calls.append('probe')
            return original_tool(argv, **options)
        def popen(_argv, **options):
            seconds = next(samples)
            return real_popen([sys.executable, '-I', '-c',
                               'import sys,time;time.sleep(float(sys.argv[1]));print("ready")',
                               str(seconds)], **options)
        return runner, calls, (patch.object(runner, 'spawn', side_effect=spawn),
                               patch.object(runner, 'tool', side_effect=tool),
                               patch.object(session.subprocess, 'Popen', side_effect=popen))

    def test_slow_first_display_probe_then_ready_uses_same_five_second_window(self):
        runner, calls, patches = self.desktop_control(iter((1.1, 0)))
        started = time.monotonic()
        with patches[0], patches[1], patches[2]:
            runner.desktop()
        runner.close()
        self.assertEqual(calls, ['xvfb', 'probe', 'probe', 'openbox'])
        self.assertLess(time.monotonic() - started, 5)
        self.assertTrue(all(owned.process.poll() is not None for owned in runner.owned))

    def test_always_slow_display_probes_fail_original_window_and_never_openbox(self):
        runner, calls, patches = self.desktop_control(iter([10] * 10))
        started = time.monotonic()
        with patches[0], patches[1], patches[2]:
            with self.assertRaisesRegex(session.Refused, '^display_readiness_deadline$'):
                runner.desktop()
        runner.close()
        elapsed = time.monotonic() - started
        self.assertGreaterEqual(elapsed, 4.9)
        self.assertLess(elapsed, 6)
        self.assertNotIn('openbox', calls)
        self.assertTrue(all(owned.process.poll() is not None for owned in runner.owned))

    def test_xauth_deadline_has_distinct_reason_before_xvfb(self):
        runner, calls, patches = self.desktop_control(iter(()), xauth_timeout=True)
        with patches[0], patches[1], patches[2]:
            with self.assertRaisesRegex(session.Refused, '^xauth_deadline$'):
                runner.desktop()
        self.assertEqual(calls, [])

    def test_owned_xvfb_exit_refuses_before_probe_or_openbox(self):
        for code in (0, 1):
            with self.subTest(code=code):
                if (self.root / 'run').exists():
                    import shutil
                    shutil.rmtree(self.root / 'run')
                runner, calls, patches = self.desktop_control(iter(()), xvfb_code=code)
                with patches[0], patches[1], patches[2]:
                    with self.assertRaisesRegex(session.Refused, '^xvfb_exited$'):
                        runner.desktop()
                self.assertEqual(calls, ['xvfb'])

    def test_readiness_samples_never_extend_existing_outer_deadline(self):
        runner, calls, patches = self.desktop_control(iter([10] * 10))
        runner.deadline = time.monotonic() + 0.1
        started = time.monotonic()
        with patches[0], patches[1], patches[2]:
            with self.assertRaisesRegex(session.Refused, '^display_readiness_deadline$'):
                runner.desktop()
        runner.close()
        self.assertLess(time.monotonic() - started, 1)
        self.assertEqual(calls, ['xvfb', 'probe'])

    def test_host_start_diagnostic_known_marker_and_unknown_malformed_markers(self):
        ready = b'HOST_READY pid=1234 trusted_parent=100 host_xid=200\nHOST_SUPERVISOR_START\n'
        for code in session.START_FAILURES - {'none', 'not_run'}:
            value = session.host_markers(ready + b'HOST_START_FAILURE ' + code.encode() + b'\n', 1234)
            self.assertEqual(value, ('start_failed', code))
        for malformed in (b'HOST_START_FAILURE forged\n', b'HOST_START_FAILURE unit_not_active extra\n',
                          b'HOST_SUPERVISOR_START extra\n', b'HOST_START_FAILURE\n',
                          b'HOST_START_FAILURE unit_not_active'):
            self.assertEqual(session.host_markers(ready + malformed, 1234), ('unknown', 'unknown'))
        self.assertEqual(session.host_markers(b'', 1234), ('unknown', 'unknown'))

    def test_parent_interruption_cannot_replace_original_host_failure_diagnostic(self):
        runner = self.runner()
        host, observer = Mock(), Mock()
        host.process.poll.return_value = 1
        observer.process.poll.return_value = None
        runner.capture_diagnostic('stop', session.Refused('observer_failed'), host, observer)
        # Session teardown now terminates the observer. Its later signal exit is not the original failure.
        observer.process.poll.return_value = -signal.SIGTERM
        host.process.poll.return_value = 0
        value = runner.diagnostics['stop']
        self.assertEqual(value['original_reason'], 'observer_failed')
        self.assertEqual(value['host_exit'], {'state': 'exited', 'code': 1})
        self.assertEqual(value['observer_exit'], {'state': 'running', 'code': None})
        self.assertEqual(runner.cases['stop'], 'not_run')

    def test_diagnostics_never_export_unknown_exception_text_or_invalid_exit_codes(self):
        runner = self.runner()
        host = Mock()
        host.process.poll.return_value = True
        runner.capture_diagnostic('stop', RuntimeError('secret/private/path'), host, None)
        value = runner.diagnostics['stop']
        self.assertEqual(value['original_reason'], 'internal_error')
        self.assertEqual(value['host_exit'], {'state': 'unknown', 'code': None})
        self.assertEqual(value['observer_exit'], {'state': 'not_started', 'code': None})
        self.assertNotIn('secret', json.dumps(value))

    def test_success_diagnostics_do_not_promote_an_unproven_case(self):
        runner = self.runner()
        host = Mock()
        host.process.poll.return_value = 0
        runner.capture_diagnostic('stop', None, host, None)
        runner.cleanup_failed = True
        self.assertEqual(runner.diagnostics['stop']['original_reason'], 'none')
        with self.assertRaisesRegex(session.Refused, 'cleanup_failed'):
            runner.close()
        self.assertEqual(runner.cases, {'stop': 'not_run', 'expiry': 'not_run'})

    def test_early_host_exit_freezes_observer_running_before_parent_interrupts_it(self):
        with session.Artifacts() as artifacts:
            session.create_layout(artifacts)
            runner = session.Runner(artifacts)
            real_spawn = subprocess.Popen
            marker = self.root / 'run/evidence/stop/interrupted-control'
            children = []
            def spawn(argv, **options):
                if argv == [str(self.root / 'host')]:
                    program = ('import os,sys,time;'
                               'print(f"HOST_READY pid={os.getpid()} trusted_parent=100 host_xid=200",flush=True);'
                               'print("HOST_SUPERVISOR_START",flush=True);'
                               'print("HOST_START_FAILURE unit_not_active",flush=True);'
                               'time.sleep(.2);sys.exit(1)')
                    selected = [sys.executable, '-I', '-c', program]
                else:
                    self.assertEqual(argv[-2:], ['--case', 'stop'])
                    program = ('import pathlib,signal,sys,time;'
                               'p=pathlib.Path(sys.argv[1]);'
                               '\ndef stop(*_):\n p.write_text("parent-interrupted");sys.exit(2)'
                               '\nsignal.signal(signal.SIGTERM,stop)'
                               '\nwhile True: time.sleep(.01)')
                    selected = [sys.executable, '-I', '-c', program, str(marker)]
                child = real_spawn(selected, **options)
                children.append(child)
                return child
            with patch.object(session.subprocess, 'Popen', side_effect=spawn):
                with self.assertRaisesRegex(session.Refused, '^cleanup_failed$'):
                    runner.case('stop')
            value = runner.diagnostics['stop']
            self.assertEqual(value['original_reason'], 'observer_failed')
            self.assertEqual(value['host_exit'], {'state': 'exited', 'code': 1})
            self.assertEqual(value['observer_exit'], {'state': 'running', 'code': None})
            self.assertEqual((value['host_stage'], value['start_failure']), ('start_failed', 'unit_not_active'))
            self.assertEqual(marker.read_text(), 'parent-interrupted')
            self.assertEqual(runner.cases, {'stop': 'failed', 'expiry': 'not_run'})
            self.assertTrue(all(child.poll() is not None for child in children))
            with self.assertRaisesRegex(session.Refused, '^cleanup_failed$'):
                runner.close()


if __name__ == '__main__':
    unittest.main()
