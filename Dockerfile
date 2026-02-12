FROM denoland/deno:2.1.4

# The port that your application listens to.
EXPOSE 3001

WORKDIR /app
# Ensure /app is owned by deno user
RUN chown -R deno:deno /app

# Prefer not to run as root.
USER deno

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts here if you have one
# COPY deps.ts .
# RUN deno cache deps.ts

# These steps will be re-run upon each file change in your working directory:
COPY --chown=deno:deno . .
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache src/main.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-env", "--allow-sys", "src/main.ts"]
