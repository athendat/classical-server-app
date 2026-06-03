import { JwksAdapter } from './jwks.adapter';
import { Result } from '../../../../common/types/result.type';

/**
 * Issue #40 — Vault sellado/inalcanzable al boot hacía que
 * `JwksAdapter.onModuleInit` lanzara (re-throw), abortando el bootstrap de Nest;
 * bajo `restart: unless-stopped` el contenedor crash-loopeaba y TODA la API
 * (incl. /health) quedaba caída.
 *
 * Comportamiento esperado tras el fix:
 *  - boot con Vault sellado ⇒ onModuleInit NO lanza (la API arranca).
 *  - sin clave ⇒ firma falla-cerrada (no se mintan tokens sin clave real).
 *  - cuando Vault vuelve ⇒ un reintento inicializa las claves (recupera sin restart).
 *  - Vault accesible pero vacío (primer boot) ⇒ genera y persiste la clave default.
 */
describe('JwksAdapter — boot resilience (#40)', () => {
    function buildAdapter(vaultClient: { readKV: jest.Mock; writeKV: jest.Mock }) {
        const configService = {
            get: jest.fn((key: string) => {
                if (key === 'VAULT_KV_MOUNT') return 'secret';
                if (key === 'JWKS_KEY_ROTATION_INTERVAL_HOURS') return 24;
                return undefined;
            }),
        };
        const eventEmitter = { emit: jest.fn() };
        return new JwksAdapter(
            vaultClient as any,
            configService as any,
            eventEmitter as any,
        );
    }

    const sealed = () => ({
        readKV: jest.fn().mockResolvedValue(Result.fail(new Error('Vault is sealed'))),
        writeKV: jest.fn().mockResolvedValue(Result.fail(new Error('Vault is sealed'))),
    });

    const emptyReachable = () => ({
        // readKV falla (no hay datos) pero writeKV funciona (Vault accesible).
        readKV: jest.fn().mockResolvedValue(Result.fail(new Error('not found'))),
        writeKV: jest.fn().mockResolvedValue(Result.ok(undefined)),
    });

    it('NO lanza en onModuleInit cuando Vault está sellado (la API arranca)', async () => {
        const adapter = buildAdapter(sealed());

        await expect(adapter.onModuleInit()).resolves.toBeUndefined();

        adapter.onModuleDestroy();
    });

    it('falla-cerrado: sin clave activa, getActiveKey=null y getActivePrivateKey lanza', async () => {
        const adapter = buildAdapter(sealed());
        await adapter.onModuleInit();

        await expect(adapter.getActiveKey()).resolves.toBeNull();
        await expect(adapter.getActivePrivateKey()).rejects.toThrow();

        adapter.onModuleDestroy();
    });

    it('Vault accesible pero vacío al boot: genera y activa la clave default', async () => {
        const vault = emptyReachable();
        const adapter = buildAdapter(vault);

        await adapter.onModuleInit();

        const active = await adapter.getActiveKey();
        expect(active).not.toBeNull();
        expect(vault.writeKV).toHaveBeenCalled();

        adapter.onModuleDestroy();
    });

    it('recupera sin restart: tras boot sellado, un reintento con Vault accesible inicializa la clave', async () => {
        const vault = sealed();
        const adapter = buildAdapter(vault);
        await adapter.onModuleInit();
        expect(await adapter.getActiveKey()).toBeNull(); // notReady

        // Vault se desella: readKV sigue sin datos, writeKV ahora funciona.
        vault.readKV.mockResolvedValue(Result.fail(new Error('not found')));
        vault.writeKV.mockResolvedValue(Result.ok(undefined));

        const recovered = await (adapter as any).tryInitialize();

        expect(recovered).toBe(true);
        expect(await adapter.getActiveKey()).not.toBeNull();

        adapter.onModuleDestroy();
    });
});
