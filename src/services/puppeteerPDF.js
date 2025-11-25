import puppeteer from 'puppeteer';
import os from 'os';
import path from 'path';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    let userDataDir = null;
    
    try {
      console.log('=== INICIANDO GENERACIÓN PDF CON PUPPETEER COMPLETO ===');
      
      // Configurar entorno específicamente para Windows Server
      process.env.PUPPETEER_CACHE_DIR = path.join(os.tmpdir(), 'puppeteer_cache');
      process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';
      
      // Crear directorio para caché de Puppeteer
      const puppeteerCacheDir = path.join(os.tmpdir(), 'puppeteer_cache');
      if (!fs.existsSync(puppeteerCacheDir)) {
        fs.mkdirSync(puppeteerCacheDir, { recursive: true });
      }

      // Directorio temporal único para esta instancia
      userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puppeteer_session_'));
      console.log('UserDataDir configurado:', userDataDir);

      const browserOptions = {
        headless: 'new', // Usar el nuevo headless
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
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--max-old-space-size=4096'
        ],
        timeout: 120000,
        ignoreDefaultArgs: ['--disable-extensions']
      };

      console.log('Opciones del browser:', JSON.stringify(browserOptions, null, 2));
      console.log('Lanzando browser...');

      // Forzar el uso de puppeteer completo
      browser = await puppeteer.launch(browserOptions);
      
      console.log('Browser iniciado correctamente con Puppeteer');
      console.log('Browser target:', await browser.target());

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(60000);

      // Configurar manejo de errores de página
      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
      page.on('pageerror', error => console.log('Page error:', error));

      console.log('Configurando contenido HTML...');
      try {
        await page.setContent(htmlContent, {
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: 60000
        });
        console.log('Contenido HTML cargado correctamente');
      } catch (contentError) {
        console.warn('Error en setContent, continuando...', contentError.message);
      }

      // Esperar a que las fuentes y recursos carguen
      console.log('Esperando recursos...');
      try {
        await page.evaluateHandle('document.fonts.ready');
        console.log('Fuentes cargadas');
      } catch (fontError) {
        console.warn('Error cargando fuentes:', fontError.message);
      }

      // Esperar adicional para recursos
      await new Promise(resolve => setTimeout(resolve, 2000));

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

      console.log('PDF generado exitosamente, tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('Error completo en generatePDF:', error);
      console.error('Stack trace:', error.stack);
      
      // Información adicional para debugging
      console.log('=== DEBUG INFO ===');
      console.log('Node version:', process.version);
      console.log('Platform:', process.platform);
      console.log('Arch:', process.arch);
      console.log('Current directory:', process.cwd());
      
      throw error;
    } finally {
      // Cerrar browser
      if (browser) {
        try {
          await browser.close();
          console.log('Browser cerrado correctamente');
        } catch (closeError) {
          console.warn('Error cerrando browser:', closeError.message);
        }
      }
      
      // Limpiar directorio temporal
      if (userDataDir && fs.existsSync(userDataDir)) {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true });
          console.log('UserDataDir limpiado');
        } catch (cleanupError) {
          console.warn('Error limpiando userDataDir:', cleanupError.message);
        }
      }
    }
  }
}

export default PuppeteerPDF;