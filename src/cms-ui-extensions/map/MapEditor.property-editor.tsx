import {AxiomProvider} from '@optiaxiom/react';
import {register} from '@optimizely/cms-extensibility-sdk';
import {installBridgeSpy} from '../common/bridgeSpy';
import {MapEditor} from './MapEditor';

// Must run before register() so the spy sees the CMS_INIT message. No debugger in this editor:
// the spy's [UXD] console log is the only way to see its bridge traffic.
installBridgeSpy();

register((context) => (
  <AxiomProvider>
    <MapEditor context={context} storage="string" />
  </AxiomProvider>
));
