import { lazy } from 'react';
import { nativeProductBootstrap } from './nativeProductBootstrap';

// React may replay rendering; both this lazy result and the window's bootstrap
// promise are stable. No effect owns initialization or acquires another host.
export const NativeProductStartup = lazy(async () => {
  const session = await nativeProductBootstrap.start();
  // start preloaded this presentation before negotiating any authority.
  const { NativeProductEntry } = await import('./NativeProductEntry');
  return {
    default: function NativeWorkspace() {
      return <NativeProductEntry session={session} />;
    },
  };
});
