import { createServer } from './app';

// En développement, PORT peut être celui de Vite : on utilise API_PORT pour l'API.
const port = Number(process.env.API_PORT ?? (process.env.NODE_ENV === 'production' ? process.env.PORT : undefined) ?? 3001);
createServer().listen(port, '0.0.0.0', () => console.log(`🚀 Space Opera – API sur http://localhost:${port}`));
