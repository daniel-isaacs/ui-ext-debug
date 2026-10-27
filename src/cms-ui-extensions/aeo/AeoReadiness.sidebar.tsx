import {register} from '@optimizely/cms-extensibility-sdk';
import {installBridgeSpy} from '../common/bridgeSpy';
import {AeoReadiness} from './AeoReadiness';

// Must run before register() so the spy sees the CMS_INIT message.
installBridgeSpy();

// No AxiomProvider: the panel is styled from its own tokens (aeo.css), not Axiom's theme.
register((context) => <AeoReadiness context={context} />);
