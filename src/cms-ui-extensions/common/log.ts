import {LOG_PREFIX} from '@shared/constants';

/** Writes a collapsed group to the console. Filter the CMS console on "[UXD]" to see only these. */
export function logGroup(label: string, data: unknown): void {
  console.groupCollapsed(`${LOG_PREFIX} ${label}`);
  console.log(data);
  console.groupEnd();
}
