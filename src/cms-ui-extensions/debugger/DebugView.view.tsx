import {AxiomProvider} from '@optiaxiom/react';
import {register} from '@optimizely/cms-extensibility-sdk';
import {installBridgeSpy} from '../common/bridgeSpy';
import {installCrossFrame} from '../common/crossFrame';
import {DebuggerApp} from '../common/DebuggerApp';

// Must run before register() so the spy sees the CMS_INIT message.
installBridgeSpy();
installCrossFrame('view');

register((context) => (
  <AxiomProvider>
    <DebuggerApp context={context} surface="view" />
  </AxiomProvider>
));
