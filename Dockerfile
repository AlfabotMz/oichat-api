# Etapa base
FROM denoland/deno:1.44.4


# Diretório de trabalho
WORKDIR /app

# Copia arquivos do projeto
COPY . .

# Permissões para Deno (ajuste conforme o necessário)
CMD ["run", "--allow-net", "--allow-read", "--allow-env", "src/main.ts"]
