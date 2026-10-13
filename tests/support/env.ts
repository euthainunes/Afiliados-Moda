// Ambiente de teste: banco separado e e-mails capturados em memória. Todos os dados criados são fictícios.
process.env.DATABASE_URL ??= "postgres://afiliados:afiliados_dev@localhost:5432/afiliados_test";
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
process.env.AUTH_SECRET ??= "segredo-de-teste-com-mais-de-32-caracteres-0123456789";
process.env.APP_URL ??= "http://localhost:3000";
process.env.MAIL_DRIVER = "memory";
