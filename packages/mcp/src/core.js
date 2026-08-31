let core;
try {
  core = await import('osv-ui/scanner');
} catch (error) {
  if (!['ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code)) throw error;
  core = await import('osv-ui/src/scanner.js');
}

export const scanService = core.scanService;
