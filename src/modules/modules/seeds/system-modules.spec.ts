import { SYSTEM_MODULES, getSystemModuleByIndicator } from './system-modules';

describe('SYSTEM_MODULES seed catalog', () => {
  it('does not expose an active "contact" module (admin app has no /system/contact route, see admin issue #5)', () => {
    const contactModule = getSystemModuleByIndicator('contact');

    if (contactModule !== undefined) {
      expect(contactModule.status).not.toBe('active');
    }

    const activeContactInExport = SYSTEM_MODULES.find(
      (m) => m.indicator === 'contact' && m.status === 'active',
    );
    expect(activeContactInExport).toBeUndefined();
  });
});
