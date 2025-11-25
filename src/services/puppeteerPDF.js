import puppeteer from 'puppeteer';
import fs from 'fs';
import { execSync } from 'child_process';

class EdgePDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('BUSCANDO MICROSOFT EDGE...');

      // Método 1: Buscar Edge en rutas comunes
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.PROGRAMFILES + '\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe'
      ];

      let edgePath = null;
      for (const path of edgePaths) {
        try {
          if (fs.existsSync(path)) {
            edgePath = path;
            console.log('EDGE ENCONTRADO:', path);
            break;
          }
        } catch (e) {
          // Continuar con la siguiente ruta
        }
      }

      // Método 2: Buscar en el registro de Windows
      if (!edgePath) {
        try {
          const registryPath = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" /ve 2>nul', { encoding: 'utf8' });
          const match = registryPath.match(/REG_SZ\s+(.*)/);
          if (match && match[1]) {
            edgePath = match[1].trim();
            console.log('EDGE ENCONTRADO EN REGISTRO:', edgePath);
          }
        } catch (e) {
          console.log('Edge no encontrado en registro');
        }
      }

      if (!edgePath) {
        throw new Error('MICROSOFT EDGE NO ENCONTRADO. Verifique que esté instalado.');
      }

      // VERIFICAR QUE EL ARCHIVO EXISTA
      if (!fs.existsSync(edgePath)) {
        throw new Error(`Edge encontrado pero el archivo no existe: ${edgePath}`);
      }

      console.log('CONFIGURANDO PUPPETEER CON EDGE...');

      // CONFIGURACIÓN CRÍTICA - Forzar uso de Edge
      const browserOptions = {
        executablePath: edgePath, // ESTA LÍNEA ES CRÍTICA
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
          '--single-process',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding'
        ],
        ignoreHTTPSErrors: true
      };

      console.log('EJECUTABLE PATH:', browserOptions.executablePath);
      console.log('LANZANDO EDGE...');

      browser = await puppeteer.launch(browserOptions);
      console.log('EDGE LANZADO EXITOSAMENTE');

      const page = await browser.newPage();
      
      // Configuración básica
      await page.setViewport({ width: 1200, height: 800 });

      console.log('CARGANDO CONTENIDO HTML...');
      await page.setContent(htmlContent, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });

      console.log('ESPERANDO RENDERIZADO...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('GENERANDO PDF...');
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm', 
          bottom: '20mm',
          left: '15mm'
        }
      });

      console.log('PDF GENERADO - Tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR CRÍTICO:', error.message);
      console.error('Stack:', error.stack);
      
      // Información de diagnóstico
      console.log('DIAGNÓSTICO:');
      console.log(' - Node.js version:', process.version);
      console.log(' - Platform:', process.platform);
      console.log(' - Arch:', process.arch);
      
      throw new Error(`FALLÓ GENERACIÓN PDF: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('NAVEGADOR CERRADO');
        } catch (e) {
          console.log('Error cerrando navegador:', e.message);
        }
      }
    }
  }
}

export default EdgePDF;