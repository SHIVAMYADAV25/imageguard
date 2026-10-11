import { serpapiLens } from './serpapiLens';
import { yandex } from './yandex';
import { tineye } from './tineye';
import { textSearch } from './textSearch';
import { ownIndex } from './ownIndex';
import { DiscoveryConnector } from './types';

/** Order does not matter: they all run in parallel. Add a new source = add one file + one line. */
export const allConnectors: DiscoveryConnector[] = [serpapiLens, yandex, tineye, textSearch, ownIndex];
