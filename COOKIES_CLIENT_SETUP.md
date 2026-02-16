# Configuración de Cookies en el Cliente

## Problema
Las cookies no se están enviando automáticamente en las siguientes peticiones después del login.

## Causa
El cliente debe configurarse explícitamente para enviar cookies con todas las peticiones.

## Solución

### Para Fetch API
```javascript
// ❌ INCORRECTO - Las cookies NO se envían
fetch('http://localhost:9053/api_053/users/profile', {
  method: 'GET',
  headers: {
    'x-api-key': 'tu-api-key'
  }
})

// ✅ CORRECTO - Las cookies SE envían
fetch('http://localhost:9053/api_053/users/profile', {
  method: 'GET',
  headers: {
    'x-api-key': 'tu-api-key'
  },
  credentials: 'include'  // ← IMPORTANTE: Esto permite enviar cookies
})
```

### Para Axios (recomendado)
```javascript
import axios from 'axios';

// Crear instancia de Axios con credentials habilitadas
const axiosInstance = axios.create({
  baseURL: 'http://localhost:9053/api_053',
  headers: {
    'x-api-key': 'tu-api-key'
  },
  withCredentials: true  // ← IMPORTANTE: Esto permite enviar cookies
});

// Ahora todas las peticiones automaticamente enviarán las cookies
axiosInstance.get('/users/profile')
  .then(response => console.log(response.data))
  .catch(error => console.error(error));
```

### Para Angular HttpClient
```typescript
import { HttpClient, HttpClientModule } from '@angular/common/http';

// En el módulo
@NgModule({
  imports: [HttpClientModule],
})
export class AppModule { }

// En el servicio
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  constructor(private http: HttpClient) { }

  getProfile() {
    // HttpClient envía cookies automáticamente
    return this.http.get('/api_053/users/profile', {
      headers: {
        'x-api-key': 'tu-api-key'
      },
      withCredentials: true  // ← IMPORTANTE
    });
  }
}
```

### Para React con Fetch
```javascript
// Cliente HTTP con cookies habilitadas
export const apiClient = {
  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_API_KEY,
        ...options.headers
      },
      credentials: 'include'  // ← IMPORTANTE
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  },

  get(url, options) {
    return this.request(url, { ...options, method: 'GET' });
  },

  post(url, body, options) {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};

// Uso en componentes
function useProfile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    apiClient.get('/api_053/users/profile')
      .then(setProfile)
      .catch(console.error);
  }, []);

  return profile;
}
```

## Verificar que las Cookies se están guardando

1. Abre DevTools (F12 en Chrome, Firefox, Edge)
2. Ve a la pestaña "Application" (Chrome/Edge) o "Storage" (Firefox)
3. Selecciona "Cookies" en el menú lateral
4. Busca el dominio de tu aplicación (ej: localhost:9053)
5. Deberías ver dos cookies:
   - `access_token` - Token de acceso (1 hora)
   - `refresh_token` - Token de refresco (7 días)

## Verificar que las Cookies se están enviando

1. En DevTools, ve a la pestaña "Network"
2. Realiza una petición (ej: GET a `/api_053/users/profile`)
3. Haz click en la petición para ver los detalles
4. En la pestaña "Request Headers", deberías ver:
   ```
   Cookie: access_token=...; refresh_token=...
   ```

## Environment Variables Importantes

En el servidor, asegúrate de que estas variables estén configuradas:

```env
# En producción
CORS_ORIGIN=https://tu-dominio.com
COOKIE_DOMAIN=tu-dominio.com
NODE_ENV=production

# En desarrollo
CORS_ORIGIN=http://localhost:4200
COOKIE_DOMAIN=  # Dejar vacío en desarrollo local
NODE_ENV=development
```

## Notas sobre SameSite y Secure

- **SameSite=lax**: Se usa en desarrollo local (http://localhost). Las cookies se envían en navegación del sitio.
- **SameSite=none; Secure**: Se usa en producción HTTPS. Permite cross-origin si está configurado correctamente en CORS.

La configuración actual:
- Desarrollo: `sameSite: 'lax'`, `secure: false`
- Producción: `sameSite: 'none'`, `secure: true`
