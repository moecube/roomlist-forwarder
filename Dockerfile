FROM node:12-stretch-slim

COPY . /roomlist-forwarder
WORKDIR /roomlist-forwarder
RUN npm ci

EXPOSE 7923
VOLUME /roomlist-forwarder/ssl

CMD ["node", "server.js"]
