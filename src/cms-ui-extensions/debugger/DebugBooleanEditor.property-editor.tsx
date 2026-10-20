import {AxiomProvider} from '@optiaxiom/react';
import {register} from '@optimizely/cms-extensibility-sdk';
import {installBridgeSpy} from '../common/bridgeSpy';
import {installFonts} from '../common/fonts';
import {PropertyEditorShell} from '../common/PropertyEditorShell';

// Must run before register() so the spy sees the CMS_INIT message.
installBridgeSpy();
installFonts();

register((context) => (
  <AxiomProvider>
    <PropertyEditorShell context={context} kind="boolean" />
  </AxiomProvider>
));
