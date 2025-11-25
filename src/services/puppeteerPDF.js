import puppeteer from 'puppeteer';
import os from 'os';
import path from 'path';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    let userDataDir = null;
    
    try {
      console.log('=== INICIANDO GENERACIÓN PDF ===');

      // Configurar directorio de cache personalizado
      const customCacheDir = path.join(process.cwd(), 'puppeteer_cache');
      if (!fs.existsSync(customCacheDir)) {
        fs.mkdirSync(customCacheDir, { recursive: true });
      }

      // Configurar variables de entorno
      process.env.PUPPETEER_CACHE_DIR = customCacheDir;
      process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';
      
      console.log('Cache directory:', customCacheDir);

      // Obtener la ruta ejecutable de Puppeteer
      let executablePath = puppeteer.executablePath();
      console.log('Executable path from puppeteer:', executablePath);

      // Si no existe, forzar descarga
      if (!executablePath || !fs.existsSync(executablePath)) {
        console.log('Chromium no encontrado, forzando descarga...');
        // Usar una ruta alternativa
        executablePath = path.join(customCacheDir, 'chrome-win64', 'chrome.exe');
        
        // Si tampoco existe ahí, usar Chrome del sistema
        if (!fs.existsSync(executablePath)) {
          console.log('Buscando Chrome instalado en el sistema...');
          const systemChromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
          ];
          
          for (const chromePath of systemChromePaths) {
            if (fs.existsSync(chromePath)) {
              executablePath = chromePath;
              console.log('Usando Chrome del sistema:', executablePath);
              break;
            }
          }
        }
      }

      // Si no encontramos ningún navegador, lanzar error claro
      if (!executablePath || !fs.existsSync(executablePath)) {
        throw new Error(`
          No se pudo encontrar ningún navegador. Soluciones:
          1. Ejecutar: npx puppeteer browsers install chrome
          2. Instalar Chrome en el servidor
          3. Verificar permisos de escritura en: ${customCacheDir}
        `);
      }

      console.log('Usando executablePath:', executablePath);

      // Directorio de usuario temporal
      userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puppeteer_'));
      console.log('UserDataDir:', userDataDir);

      const browserOptions = {
        headless: 'new',
        executablePath: executablePath,
        userDataDir: userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--font-render-hinting=none'
        ],
        timeout: 120000
      };

      console.log('Lanzando browser...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado correctamente');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(60000);

      // Configurar manejo de errores
      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
      page.on('pageerror', error => console.log('Page error:', error));

      try {
        await page.setContent(htmlContent, {
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: 60000
        });
      } catch (contentError) {
        console.warn('Error en setContent, continuando...', contentError.message);
      }

      try {
        await page.evaluateHandle('document.fonts.ready');
      } catch (fontError) {
        console.warn('Error cargando fuentes:', fontError.message);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const pdfOptions = {
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        omitBackground: false,
        timeout: 60000,
        margin: {
          top: options.marginTop || '20mm',
          right: options.marginRight || '15mm',
          bottom: options.marginBottom || '20mm',
          left: options.marginLeft || '15mm'
        }
      };

      console.log('Generando PDF buffer...');
      const pdfBuffer = await page.pdf(pdfOptions);
      
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('El PDF generado está vacío');
      }

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
      if (userDataDir && fs.existsSync(userDataDir)) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Error limpiando userDataDir:', cleanupError.message);
        }
      }
    }
  }
}

export default PuppeteerPDF;