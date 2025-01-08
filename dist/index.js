"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const exceljs_1 = __importDefault(require("exceljs"));
const bwip_js_1 = __importDefault(require("bwip-js"));
const multer_1 = __importDefault(require("multer"));
const codigos_1 = require("./utils/codigos");
const app = (0, express_1.default)();
const port = 3000;
const storage = multer_1.default.memoryStorage(); // Armazenamento em memória para manipulação direta de buffers
const upload = (0, multer_1.default)({ storage: storage });
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use(express_1.default.urlencoded({ extended: true }));
const generateBarcodeImage = async (codigo, format) => {
    // Define o tipo de código de barras com base no formato
    const bcid = format === 'ean13' ? 'ean13'
        : format === 'ean14' ? 'ean14'
            : 'code128'; // Default para 'code128'
    // Converta o número para uma string e ajuste o comprimento
    let codigoString = codigo.toString();
    if (format === 'ean13') {
        codigoString = codigoString.padStart(13, '0');
    }
    else if (format === 'ean14') {
        codigoString = codigoString.padStart(14, '0');
        // Verifique se o comprimento é 14 dígitos
        if (codigoString.length !== 14) {
            throw new Error('O código EAN-14 deve ter exatamente 14 dígitos.');
        }
    }
    else if (format === 'code128') {
        // Nenhum ajuste necessário para code128
    }
    else {
        throw new Error('Formato inválido');
    }
    // Verifique se o código tem apenas dígitos
    if (!/^\d+$/.test(codigoString)) {
        throw new Error('O código deve conter apenas dígitos.');
    }
    try {
        console.log(`Gerando imagem para código ${codigoString} com formato ${bcid}`);
        const pngBuffer = await bwip_js_1.default.toBuffer({
            bcid: bcid,
            text: codigoString,
            scale: 3,
            height: 10,
            includetext: true,
            textxalign: 'center',
            paddingwidth: 20,
            paddingheight: 10
        });
        const barcodeDir = path_1.default.join(__dirname, '../public/barcodes');
        ensureDirectoryExists(barcodeDir);
        const filename = path_1.default.join(barcodeDir, `barcode_${bcid}_${codigoString}.png`);
        fs_1.default.writeFileSync(filename, pngBuffer);
        console.log(`Imagem salva em ${filename}`);
        return filename;
    }
    catch (error) {
        console.error(`Erro ao gerar código de barras ${codigoString}:`, error);
        return null;
    }
};
// Função auxiliar para garantir que o diretório exista
const ensureDirectoryExists = (dir) => {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
};
// Teste para gerar uma imagem
codigos_1.ean14.forEach(async (codigo) => {
    await generateBarcodeImage(codigo, 'ean14');
});
app.post('/import', upload.single('file'), async (req, res) => {
    const { format } = req.body;
    if (!format || (format !== 'code128' && format !== 'ean13' && format !== 'ean14')) {
        return res.status(400).send('Formato inválido. Escolha entre code128, ean13 ou ean14.');
    }
    const file = req.file;
    if (!file) {
        return res.status(400).send('Nenhum arquivo enviado.');
    }
    try {
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.load(file.buffer);
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) {
            return res.status(400).send('Planilha não encontrada.');
        }
        const codes = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
            const cellValue = row.getCell(1).value;
            const codigo = typeof cellValue === 'number' ? cellValue : Number(cellValue);
            if (!isNaN(codigo)) {
                codes.push(codigo);
            }
        });
        const imagePaths = [];
        for (const codigo of codes) {
            const imagePath = await generateBarcodeImage(codigo, format);
            if (imagePath) {
                // Converta para caminho relativo
                const relativePath = path_1.default.relative(path_1.default.join(__dirname, '../public'), imagePath);
                imagePaths.push(`/${relativePath}`);
            }
        }
        // Atualiza o array de códigos
        if (format === 'code128') {
            codigos_1.code128.push(...codes);
        }
        else if (format === 'ean13') {
            codigos_1.ean13.push(...codes);
        }
        else if (format === 'ean14') {
            codigos_1.ean14.push(...codes);
        }
        // Redireciona para a página inicial com um parâmetro de status
        res.redirect('/?importStatus=success');
    }
    catch (error) {
        console.error('Erro ao importar dados do Excel:', error);
        res.status(500).send('Erro ao importar dados do Excel');
    }
});
app.get('/export', async (req, res) => {
    const format = req.query.format;
    if (!format || (format !== 'code128' && format !== 'ean13' && format !== 'ean14' && format !== 'both')) {
        return res.status(400).send('Formato inválido. Escolha entre code128, ean13, ean14 ou both.');
    }
    try {
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('Dados');
        worksheet.columns = [
            { header: 'Código', key: 'codigo', width: 20, style: { numFmt: '@' } }, // Formata como texto
            { header: 'Imagem', key: 'imagem', width: 40 }
        ];
        const codes = format === 'code128' ? codigos_1.code128
            : format === 'ean13' ? codigos_1.ean13
                : format === 'ean14' ? codigos_1.ean14
                    : [...codigos_1.code128, ...codigos_1.ean13, ...codigos_1.ean14];
        for (const codigo of codes) {
            console.log(`Processando código ${codigo}`);
            const codeFormat = format === 'code128' ? 'code128'
                : format === 'ean13' ? 'ean13'
                    : format === 'ean14' ? 'ean14'
                        : 'code128'; // Ajusta o formato do código de barras para cada caso
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
        const filePath = path_1.default.join(__dirname, '../public', `dados_${format}.xlsx`);
        await workbook.xlsx.writeFile(filePath);
        res.sendFile(filePath);
    }
    catch (error) {
        console.error('Erro ao exportar para Excel:', error);
        res.status(500).send('Erro ao exportar para Excel');
    }
});
app.post('/clear', (req, res) => {
    const { format } = req.body;
    if (!format || (format !== 'code128' && format !== 'ean13' && format !== 'ean14')) {
        return res.status(400).send('Formato inválido. Escolha entre code128, ean13 ou ean14.');
    }
    const barcodeDir = path_1.default.join(__dirname, '../public/barcodes');
    const files = fs_1.default.readdirSync(barcodeDir);
    files.forEach((file) => {
        if (format === 'code128' && file.startsWith('barcode_code128_')) {
            fs_1.default.unlinkSync(path_1.default.join(barcodeDir, file));
        }
        else if (format === 'ean13' && file.startsWith('barcode_ean13_')) {
            fs_1.default.unlinkSync(path_1.default.join(barcodeDir, file));
        }
        else if (format === 'ean14' && file.startsWith('barcode_ean14_')) {
            fs_1.default.unlinkSync(path_1.default.join(barcodeDir, file));
        }
    });
    // Limpa os arrays de códigos
    if (format === 'code128') {
        codigos_1.code128.length = 0;
    }
    else if (format === 'ean13') {
        codigos_1.ean13.length = 0;
    }
    else if (format === 'ean14') {
        codigos_1.ean14.length = 0;
    }
    res.redirect('/?clearStatus=success');
});
app.get('/', (req, res) => {
    const importStatus = req.query.importStatus || '';
    const barcodeImagesCode128 = codigos_1.code128.map(codigo => {
        const imgSrc = `/barcodes/barcode_code128_${codigo}.png`;
        return `<div>
              <img src="${imgSrc}" alt="Código ${codigo}" />
              <a href="${imgSrc}" download="barcode_code128_${codigo}.png">
                <button class="action-button">Baixar Imagem</button>
              </a>
            </div>`;
    }).join('<br>');
    const barcodeImagesEAN13 = codigos_1.ean13.map(codigo => {
        const imgSrc = `/barcodes/barcode_ean13_${codigo}.png`;
        return `<div>
              <img src="${imgSrc}" alt="Código ${codigo}" />
              <a href="${imgSrc}" download="barcode_ean13_${codigo}.png">
                <button class="action-button">Baixar Imagem</button>
              </a>
            </div>`;
    }).join('<br>');
    const barcodeImagesEAN14 = codigos_1.ean14.map(codigo => {
        const imgSrc = `/barcodes/barcode_ean14_${codigo}.png`;
        return `<div>
              <img src="${imgSrc}" alt="Código ${codigo}" />
              <a href="${imgSrc}" download="barcode_ean14_${codigo}.png">
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
                        <option value="ean14">Exportar EAN14</option>
                        <option value="both">Exportar Todos</option>
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
                      <option value="ean14">Importar EAN14</option>
                    </select>
                    <button type="submit">Importar Código</button>
                </form>
            </div>
        </div>
         <div class="content">
        ${importStatus === 'success' ? '' : ''}
        <div class="barcode-columns">
            <div class="barcode-column" id="barcode-code128">
                <h2>Code128</h2>
                ${barcodeImagesCode128}
                <form action="/clear" method="post">
                  <input type="hidden" name="format" value="code128" />
                  <button type="submit">Limpar Imagens Code128</button>
                </form>
            </div>
            <div class="barcode-column" id="barcode-ean13">
                <h2>EAN13</h2>
                ${barcodeImagesEAN13}
                <form action="/clear" method="post">
                  <input type="hidden" name="format" value="ean13" />
                  <button type="submit">Limpar Imagens EAN13</button>
                </form>
            </div>
            <div class="barcode-column" id="barcode-ean14">
                <h2>EAN14</h2>
                ${barcodeImagesEAN14}
                <form action="/clear" method="post">
                  <input type="hidden" name="format" value="ean14" />
                  <button type="submit">Limpar Imagens EAN14</button>
                </form>
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
