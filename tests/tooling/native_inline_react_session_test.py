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


if __name__ == '__main__':
    unittest.main()
