# SAE AutoSim Hub — static frontend served by nginx.
# The API is proxied to the `backend` service by nginx (see nginx.conf).

FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Static site assets
COPY index.html /usr/share/nginx/html/index.html
COPY sw.js manifest.json icon.svg robots.txt sitemap.xml /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY sim-engine/ /usr/share/nginx/html/sim-engine/
COPY locales/ /usr/share/nginx/html/locales/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
