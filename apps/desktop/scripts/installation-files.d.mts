/** File the list is written to, directly inside the resources directory. */
export const INSTALLATION_FILES_NAME: string
/**
 * Write the list of shipped files beside them.
 * @param resourcesDir Assembled application resources directory.
 * @returns Number of files recorded.
 */
export function writeInstallationFiles(resourcesDir: string): Promise<number>
