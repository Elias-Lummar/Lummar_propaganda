const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Sistema de Propagandas - API",
      version: "1.0.0",
      description:
        "API para gerenciamento de propagandas e anúncios em painéis de apresentação digital.",
      contact: {
        name: "Lummar Propaganda",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Servidor de Desenvolvimento",
      },
    ],
    tags: [
      {
        name: "Ads",
        description: "Operações de gerenciamento de anúncios",
      },
      {
        name: "Upload",
        description: "Upload de arquivos de mídia",
      },
      {
        name: "Pages",
        description: "Páginas da aplicação",
      },
    ],
    components: {
      schemas: {
        Ad: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "ID único do anúncio",
              example: 1,
            },
            title: {
              type: "string",
              description: "Título do anúncio",
              example: "Promoção de Verão",
            },
            file_path: {
              type: "string",
              description: "Caminho do arquivo de mídia",
              example: "/uploads/1706000000000-123456789.jpg",
            },
            start_time: {
              type: "string",
              format: "date-time",
              description: "Data/hora de início da exibição",
              example: "2026-01-01T08:00:00.000Z",
            },
            end_time: {
              type: "string",
              format: "date-time",
              description: "Data/hora de término da exibição",
              example: "2026-12-31T23:59:59.000Z",
            },
            transition_type: {
              type: "string",
              description: "Tipo de transição entre anúncios",
              example: "fade",
              enum: ["fade", "slide", "zoom", "none"],
            },
            transition_duration: {
              type: "integer",
              description: "Duração da transição em segundos",
              example: 3,
            },
            screens: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Lista de painéis onde o anúncio será exibido",
              example: ["presenter", "presenter1"],
            },
          },
        },
        AdInput: {
          type: "object",
          required: [
            "title",
            "file_path",
            "start_time",
            "end_time",
            "transition_type",
            "transition_duration",
            "screens",
          ],
          properties: {
            title: {
              type: "string",
              description: "Título do anúncio",
              example: "Promoção de Verão",
            },
            file_path: {
              type: "string",
              description:
                "Caminho do arquivo de mídia (retornado pelo endpoint de upload)",
              example: "/uploads/1706000000000-123456789.jpg",
            },
            start_time: {
              type: "string",
              format: "date-time",
              description: "Data/hora de início da exibição",
              example: "2026-01-01T08:00:00.000Z",
            },
            end_time: {
              type: "string",
              format: "date-time",
              description: "Data/hora de término da exibição",
              example: "2026-12-31T23:59:59.000Z",
            },
            transition_type: {
              type: "string",
              description: "Tipo de transição",
              example: "fade",
              enum: ["fade", "slide", "zoom", "none"],
            },
            transition_duration: {
              type: "integer",
              description: "Duração da transição em segundos",
              example: 3,
            },
            screens: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Lista de painéis (pelo menos um obrigatório)",
              example: ["presenter", "presenter1"],
              minItems: 1,
            },
          },
        },
        UploadResponse: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Caminho do arquivo salvo",
              example: "/uploads/1706000000000-123456789.mp4",
            },
            video_duration: {
              type: "integer",
              description: "Duração do vídeo em segundos (0 se for imagem)",
              example: 30,
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Mensagem de erro",
              example: "Erro interno do servidor",
            },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
          },
        },
        CreatedAd: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "ID do anúncio criado",
              example: 1,
            },
          },
        },
      },
    },
    paths: {
      "/api/ads": {
        get: {
          tags: ["Ads"],
          summary: "Listar todos os anúncios",
          description:
            "Retorna todos os anúncios cadastrados, ordenados por ID de forma decrescente.",
          responses: {
            200: {
              description: "Lista de anúncios retornada com sucesso",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/Ad",
                    },
                  },
                },
              },
            },
            500: {
              description: "Erro interno do servidor",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Ads"],
          summary: "Criar novo anúncio",
          description:
            "Cria um novo anúncio com os dados fornecidos. É necessário ter feito upload do arquivo de mídia antes.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdInput",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Anúncio criado com sucesso",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/CreatedAd",
                  },
                },
              },
            },
            400: {
              description: "Dados inválidos (ex: nenhum painel selecionado)",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
            500: {
              description: "Erro interno do servidor",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },
      "/api/ads/active": {
        get: {
          tags: ["Ads"],
          summary: "Listar anúncios ativos",
          description:
            "Retorna os anúncios que estão ativos no momento atual, filtrados pelo painel especificado.",
          parameters: [
            {
              name: "panel",
              in: "query",
              required: false,
              description:
                'Nome do painel para filtrar os anúncios (padrão: "presenter")',
              schema: {
                type: "string",
                default: "presenter",
                example: "presenter",
              },
            },
          ],
          responses: {
            200: {
              description: "Lista de anúncios ativos retornada com sucesso",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/Ad",
                    },
                  },
                },
              },
            },
            500: {
              description: "Erro interno do servidor",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },
      "/api/ads/{id}": {
        put: {
          tags: ["Ads"],
          summary: "Atualizar anúncio",
          description: "Atualiza os dados de um anúncio existente pelo seu ID.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "ID do anúncio a ser atualizado",
              schema: {
                type: "integer",
                example: 1,
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AdInput",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Anúncio atualizado com sucesso",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Success",
                  },
                },
              },
            },
            400: {
              description: "Dados inválidos (ex: nenhum painel selecionado)",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
            500: {
              description: "Erro interno do servidor",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Ads"],
          summary: "Excluir anúncio",
          description:
            "Exclui um anúncio pelo ID e remove o arquivo de mídia associado do servidor.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "ID do anúncio a ser excluído",
              schema: {
                type: "integer",
                example: 1,
              },
            },
          ],
          responses: {
            200: {
              description: "Anúncio excluído com sucesso",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Success",
                  },
                },
              },
            },
            500: {
              description: "Erro interno do servidor",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },
      "/api/upload": {
        post: {
          tags: ["Upload"],
          summary: "Upload de arquivo de mídia",
          description:
            "Faz upload de um arquivo de imagem ou vídeo. Arquivos aceitos: imagens (jpg, png, gif, etc.) e vídeos (mp4, avi, etc.). Tamanho máximo: 100MB. Se for vídeo, retorna a duração em segundos.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "Arquivo de imagem ou vídeo (máx. 100MB)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Upload realizado com sucesso",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/UploadResponse",
                  },
                },
              },
            },
            500: {
              description: "Erro no upload (arquivo inválido ou muito grande)",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Error",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [], // Sem anotações inline, tudo definido acima
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Lummar Propaganda - API Docs",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "list",
        filter: true,
      },
    }),
  );

  // Endpoint para obter o JSON do Swagger
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}

module.exports = { setupSwagger };
