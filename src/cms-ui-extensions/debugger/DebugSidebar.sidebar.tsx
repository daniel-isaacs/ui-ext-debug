import {AxiomProvider} from '@optiaxiom/react';
import {register} from '@optimizely/cms-extensibility-sdk';
import {installBridgeSpy} from '../common/bridgeSpy';
import {DebuggerApp} from '../common/DebuggerApp';
import {installFonts} from '../common/fonts';

// Must run before register() so the spy sees the CMS_INIT message.
installBridgeSpy();
installFonts();

register((context) => (
  <AxiomProvider>
    <DebuggerApp context={context} surface="sidebar" />
  </AxiomProvider>
));
