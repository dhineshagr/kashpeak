FROM node:18

WORKDIR /app

COPY package*.json ./
ENV NODE_ENV=production
RUN npm install --omit=dev

COPY . .

EXPOSE 5000

RUN useradd -m appuser
USER appuser

CMD ["npm", "start"]
