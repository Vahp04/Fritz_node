import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { execSync } from 'child_process';
import net from 'net';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    
    try {
      console.log('=== GENERACIÓN PDF CON PUERTO ESPECÍFICO ===');

      // Matar procesos existentes
      await this.killChromeProcesses();

      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];

      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log('Chrome encontrado:', executablePath);
          break;
        }
      }

      if (!executablePath) {
        throw new Error('No se encontró Chrome instalado');
      }

      // Generar puerto aleatorio
      const port = 9222 + Math.floor(Math.random() * 100);
      
      // Verificar que el puerto esté disponible
      await this.checkPortAvailable(port);

      const browserOptions = {
        headless: 'new',
        executablePath: executablePath,
        args: [
          `--remote-debugging-port=${port}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-gpu',
          '--single-process',
          '--disable-web-security'
        ],
        timeout: 10000
      };

      console.log(`Lanzando browser en puerto ${port}...`);
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado correctamente');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });

      await new Promise(resolve => setTimeout(resolve, 200));

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

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('Browser cerrado');
        } catch (closeError) {
          console.warn('Forzando cierre...');
          await this.killChromeProcesses();
        }
      }
    }
  }

  static async killChromeProcesses() {
    try {
      const commands = [
        'taskkill /f /im chrome.exe /t',
        'taskkill /f /im chromium.exe /t', 
        'taskkill /f /im headless_shell.exe /t'
      ];
      
      for (const cmd of commands) {
        try {
          execSync(cmd, { stdio: 'ignore', windowsHide: true });
        } catch (e) {
          // Ignorar errores (procesos no existentes)
        }
      }
      
      console.log('Procesos Chrome eliminados');
    } catch (error) {
      console.log('No había procesos activos');
    }
  }

  static async checkPortAvailable(port) {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        reject(new Error(`Puerto ${port} no disponible`));
      });
      
      server.once('listening', () => {
        server.close();
        resolve();
      });
      
      server.listen(port);
    });
  }
}

export default PuppeteerPDF;