import { ProductRoot } from '../product/ProductRoot';
import { NotificationProvider } from '../ui/Notifications';
import type { NativeProductSession } from './nativeProductBootstrap';

/** The host starts its owner before rendering; no authority is created here. */
export function NativeProductEntry({
  session,
}: {
  session: NativeProductSession;
}) {
  const Boundary = session.Boundary;
  return (
    <NotificationProvider>
      <Boundary>
        <ProductRoot application={session.application} />
      </Boundary>
    </NotificationProvider>
  );
}
