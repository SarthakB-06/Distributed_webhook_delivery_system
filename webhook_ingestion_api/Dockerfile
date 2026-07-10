FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
# Copy prisma schema and generate the client before copying the rest of the code
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]