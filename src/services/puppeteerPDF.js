import puppeteer from 'puppeteer';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('Iniciando generación de PDF con Microsoft Edge 142...');

      // Ruta específica para Edge (basado en tu versión)
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ];

      let edgePath = null;
      for (const path of edgePaths) {
        try {
          if (fs.existsSync(path)) {
            edgePath = path;
            console.log('Edge 142 encontrado en:', path);
            break;
          }
        } catch (error) {
          console.log('Edge no encontrado en:', path);
        }
      }

      if (!edgePath) {
        throw new Error('Microsoft Edge 142 no encontrado en el sistema');
      }

      // CONFIGURACIÓN ESPECÍFICA PARA EDGE 142
      const browserOptions = {
        executablePath: edgePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-ipc-flooding-protection',
          '--disable-hang-monitor',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-back-forward-cache',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-domain-reliability',
          '--disable-client-side-phishing-detection',
          '--disable-sync',
          '--disable-translate',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--use-mock-keychain',
          '--single-process'  // IMPORTANTE para servidores Windows
        ],
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
        timeout: 60000,
        dumpio: false  // Desactivar logs detallados
      };

      console.log('Configurando Edge 142...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Edge 142 lanzado exitosamente');

      const page = await browser.newPage();
      
      // Configurar timeouts
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);

      // Configurar viewport
      await page.setViewport({ 
        width: options.viewportWidth || 1200, 
        height: options.viewportHeight || 800 
      });

      // Manejar errores de consola silenciosamente
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log('Página ERROR:', msg.text());
        }
      });

      page.on('pageerror', error => {
        console.log('Error de página:', error.message);
      });

      console.log('Cargando contenido HTML...');
      
      // Cargar contenido con opciones optimizadas
      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      console.log('Esperando renderizado...');
      // Espera mínima para renderizado
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Configuración de PDF optimizada para Edge
      const pdfOptions = {
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: true,
        preferCSSPageSize: false,  // Edge funciona mejor con false
        displayHeaderFooter: false,
        margin: {
          top: options.marginTop || '20mm',
          right: options.marginRight || '15mm',
          bottom: options.marginBottom || '20mm',
          left: options.marginLeft || '15mm'
        },
        timeout: 30000
      };

      console.log('Generando PDF con Edge 142...');
      const pdfBuffer = await page.pdf(pdfOptions);

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('El PDF generado está vacío');
      }

      console.log('PDF generado exitosamente - Tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR en generatePDF:', error.message);
      
      // Información adicional para debugging
      if (error.message.includes('Target closed') || error.message.includes('Protocol error')) {
        console.error('Posible solución: Verificar memoria disponible en el servidor');
        console.error('Reducir el tamaño del HTML o usar menos recursos');
      }
      
      throw new Error(`Error generando PDF con Edge: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('Navegador cerrado correctamente');
        } catch (closeError) {
          console.log('Error menor al cerrar navegador:', closeError.message);
        }
      }
    }
  }
}

export default PuppeteerPDF;