import puppeteer from 'puppeteer';
import os from 'os';
import path from 'path';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    let userDataDir = null;
    
    try {
      console.log('=== INICIANDO PUPPETEER COMPLETO ===');
      
      // Configurar cache directory para Puppeteer
      const cacheDir = path.join(os.tmpdir(), 'puppeteer_cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      process.env.PUPPETEER_CACHE_DIR = cacheDir;
      
      // Directorio de usuario único
      userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puppeteer_'));
      console.log('UserDataDir:', userDataDir);

      // OPCIONES ESPECÍFICAS PARA PUPPETEER COMPLETO
      const browserOptions = {
        headless: 'new',
        // Forzar el uso del Chromium incluido con Puppeteer
        executablePath: puppeteer.executablePath(),
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

      console.log('Executable path:', puppeteer.executablePath());
      console.log('Lanzando browser con puppeteer completo...');

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