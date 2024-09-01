import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import bwipjs from 'bwip-js';
import multer from 'multer';
import { code128, ean13 } from './utils/codigos';

const app = express();
const port = 3000;

const storage = multer.memoryStorage(); // Armazenamento em memória para manipulação direta de buffers
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));

const ensureDirectoryExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const generateBarcodeImage = async (codigo: number, format: string) => {
  const bcid = format === 'ean13' ? 'ean13' : 'code128';
  const codigoString = format === 'code128' ? codigo.toString() : codigo.toString().padStart(13, '0'); // Ajusta o comprimento para ean13

  try {
    console.log(`Gerando imagem para código ${codigoString} com formato ${bcid}`);
    const pngBuffer = await bwipjs.toBuffer({
      bcid: bcid,
      text: codigoString,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
      paddingwidth: 20,
      paddingheight: 10
    });

    const barcodeDir = path.join(__dirname, '../public/barcodes');
    ensureDirectoryExists(barcodeDir);
    const filename = path.join(barcodeDir, `barcode_${bcid}_${codigoString}.png`);
    fs.writeFileSync(filename, pngBuffer);

    console.log(`Imagem salva em ${filename}`);
    return filename;
  } catch (error) {
    console.error(`Erro ao gerar código de barras ${codigoString}:`, error);
    return null;
  }
};

app.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  const { format } = req.body;

  if (!format || (format !== 'code128' && format !== 'ean13')) {
    return res.status(400).send('Formato inválido. Escolha entre code128 ou ean13.');
  }

  const file = req.file;

  if (!file) {
    return res.status(400).send('Nenhum arquivo enviado.');
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      return res.status(400).send('Planilha não encontrada.');
    }

    const codes: number[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cellValue = row.getCell(1).value;
      const codigo = typeof cellValue === 'number' ? cellValue : Number(cellValue);

      if (!isNaN(codigo)) {
        codes.push(codigo);
      }
    });

    const imagePaths: string[] = [];

    for (const codigo of codes) {
      const imagePath = await generateBarcodeImage(codigo, format as string);
      if (imagePath) {
        // Converta para caminho relativo
        const relativePath = path.relative(path.join(__dirname, '../public'), imagePath);
        imagePaths.push(`/${relativePath}`);
      }
    }

    // Atualiza o array de códigos
    if (format === 'code128') {
      code128.push(...codes);
    } else if (format === 'ean13') {
      ean13.push(...codes);
    }

    // Redireciona para a página inicial com um parâmetro de status
    res.redirect('/?importStatus=success');
  } catch (error) {
    console.error('Erro ao importar dados do Excel:', error);
    res.status(500).send('Erro ao importar dados do Excel');
  }
});


app.get('/export', async (req: Request, res: Response) => {
  const format = req.query.format as string;

  if (!format || (format !== 'code128' && format !== 'ean13' && format !== 'both')) {
    return res.status(400).send('Formato inválido. Escolha entre code128, ean13 ou both.');
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dados');
    
    worksheet.columns = [
      { header: 'Código', key: 'codigo', width: 20, style: { numFmt: '@' } }, // Formata como texto
      { header: 'Imagem', key: 'imagem', width: 40 }
    ];

    const codes = format === 'code128' ? code128 : format === 'ean13' ? ean13 : [...code128, ...ean13];

    for (const codigo of codes) {
      console.log(`Processando código ${codigo}`);
      const codeFormat = format === 'code128' ? 'code128' : 'ean13'; // Ajusta o formato do código de barras
      const imagePath = await generateBarcodeImage(codigo, codeFormat);
      if (imagePath) {
        const row = worksheet.addRow({ codigo: codigo.toString() }); // Converta o código para string

        const imageId = workbook.addImage({
          filename: imagePath,
          extension: 'png',
        });

        worksheet.addImage(imageId, {
          tl: { col: 1, row: row.number - 1 },
          ext: { width: 200, height: 70 }
        });

        worksheet.getRow(row.number).height = 70;
      }
    }

    const filePath = path.join(__dirname, '../public', `dados_${format}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Erro ao exportar para Excel:', error);
    res.status(500).send('Erro ao exportar para Excel');
  }
});

app.get('/', (req: Request, res: Response) => {
  const importStatus = req.query.importStatus as string || '';

  const barcodeImagesCode128 = code128.map(codigo => {
    const imgSrc = `/barcodes/barcode_code128_${codigo}.png`;
    return `<div>
              <img src="${imgSrc}" alt="Código ${codigo}" />
              <a href="${imgSrc}" download="barcode_code128_${codigo}.png">
                <button class="action-button">Baixar Imagem</button>
              </a>
            </div>`;
  }).join('<br>');

  const barcodeImagesEAN13 = ean13.map(codigo => {
    const imgSrc = `/barcodes/barcode_ean13_${codigo}.png`;
    return `<div>
              <img src="${imgSrc}" alt="Código ${codigo}" />
              <a href="${imgSrc}" download="barcode_ean13_${codigo}.png">
                <button class="action-button">Baixar Imagem</button>
              </a>
            </div>`;
  }).join('<br>');

  res.send(`
    <!DOCTYPE html>
<html>
<head>
    <title>Códigos de Barras</title>
    <link rel="stylesheet" href="/styles.css" />
</head>
<body>
    <div class="header">
        <img src="/logo.png" alt="Logo" class="logo" />
        <h1>Códigos de Barras</h1>
        <div class="actions">
            <form action="/export" method="get">
                <select name="format">
                    <option value="code128">Exportar Code128</option>
                    <option value="ean13">Exportar EAN13</option>
                    <option value="both">Exportar Ambos</option>
                </select>
                <button type="submit">Exportar para Excel</button>
            </form>
            <form action="/import" method="post" enctype="multipart/form-data">
                <input type="file" id="file-input" name="file" required hidden />
                <button type="button" id="file-button">Selecionar Arquivo</button>
                <span id="file-name">Nenhum arquivo selecionado</span>
                <select name="format" required>
                  <option value="code128">Importar Code128</option>
                  <option value="ean13">Importar EAN13</option>
                </select>
                <button type="submit">Importar Código</button>
            </form>
        </div>
    </div>
    <div class="content">
        ${importStatus === 'success' ? '' : '<p class="status-message">Não é possivel gerar importação, verifique o tipo de arquivo!!!</p>'}
        <div class="barcode-columns">
            <div class="barcode-column" id="barcode-code128">
                <h2>Code128</h2>
                ${barcodeImagesCode128}
            </div>
            <div class="barcode-column" id="barcode-ean13">
                <h2>EAN13</h2>
                ${barcodeImagesEAN13}
            </div>
        </div>
    </div>
    <script>
        const fileButton = document.getElementById('file-button');
        const fileInput = document.getElementById('file-input');
        const fileName = document.getElementById('file-name');

        fileButton.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            fileName.textContent = fileInput.files[0] ? fileInput.files[0].name : 'Nenhum arquivo selecionado';
        });
    </script>
</body>
</html>
  `);
});


app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
