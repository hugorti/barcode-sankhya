# 1. Use uma imagem base com Node.js
FROM node:16

# 2. Defina o diretório de trabalho dentro do contêiner
WORKDIR /app

# 3. Copie o package.json e o yarn.lock primeiro
COPY package.json yarn.lock ./

# 4. Instale as dependências
RUN yarn install

# 5. Copie todo o código da aplicação
COPY . .

# 6. Dê permissão de execução para o diretório atual
RUN chmod -R 755 /app

# 7. Compile o TypeScript para JavaScript
RUN yarn run build

# 8. Exponha a porta na qual a aplicação será executada (por exemplo, 3000)
EXPOSE 3000

# 9. Comando para iniciar a aplicação
CMD ["yarn", "start"]
