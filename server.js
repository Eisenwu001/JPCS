import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run the bundle build synchronously on startup
try {
  console.log('Building assets...');
  execSync('node build.js', { stdio: 'inherit' });
} catch (err) {
  console.error('Failed to build assets:', err);
}

const app = express();
const PORT = 3000;

// Serve static files from the compiled dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback all routes to dist/index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
