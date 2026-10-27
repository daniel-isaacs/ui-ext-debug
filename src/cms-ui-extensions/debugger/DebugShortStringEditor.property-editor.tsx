import {AxiomProvider} from '@optiaxiom/react';
import {register} from '@optimizely/cms-extensibility-sdk';
import {installBridgeSpy} from '../common/bridgeSpy';
import {installCrossFrame} from '../common/crossFrame';
import {PropertyEditorShell} from '../common/PropertyEditorShell';

// Must run before register() so the spy sees the CMS_INIT message.
installBridgeSpy();
installCrossFrame('short string editor');

register((context) => (
  <AxiomProvider>
    <PropertyEditorShell context={context} kind="string" />
  </AxiomProvider>
));
