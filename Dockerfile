# Etapa base
FROM denoland/deno:2.4.1


# Diretório de trabalho
WORKDIR /app

# Copia arquivos do projeto
COPY . .

RUN deno cache src/main.ts

# Permissões para Deno (ajuste conforme o necessário)
CMD ["run", "--allow-net", "--allow-read", "--allow-env", "--allow-sys", "src/main.ts"]
