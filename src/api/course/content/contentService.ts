import { ContentDTO, ContentModel } from '@/api/course/content/contentModel';
import { contentRepository } from '@/api/course/content/contentRepository';

import { sectionRepository } from '../section/sectionRepository';

export const contentService = {
  addReactionToContent: async (contentId: string, isSatisfied: boolean, userId: string): Promise<ContentDTO | null> => {
    const updatedContent = await contentRepository.addReactionToContent(contentId, isSatisfied, userId);
    return updatedContent ? updatedContent : null;
  },

  getReactionsByContentId: async (
    contentId: string
  ): Promise<{ reactions: { userId: string; isSatisfied: boolean }[] } | null> => {
    return await contentRepository.getReactionsByContentId(contentId);
  },

  getContentById: async (
    contentId: string,
    studentUserId?: string // Ahora es opcional
  ): Promise<ContentDTO & { userIsSatisfied?: boolean | null }> => {
    const content = await contentRepository.findById(contentId);
    const contentDto = content.toDto();

    // Solo verifica la reacción del usuario si studentUserId está presente
    if (studentUserId) {
      const userReaction = content.reactions?.find((reaction) => reaction.userId.toString() === studentUserId);
      return {
        ...contentDto,
        userIsSatisfied: userReaction ? userReaction.isSatisfied : null,
      };
    }

    // Devuelve el DTO sin userIsSatisfied si no se proporciona studentUserId
    return {
      ...contentDto,
    };
  },

  async updateContentVisibility(contentId: string, visible: boolean): Promise<ContentDTO> {
    const content = await ContentModel.findByIdAndUpdate(contentId, { visible }, { new: true });

    if (!content) {
      throw new Error('Content not found');
    }

    return content.toDto();
  },

  async updateContentApproval(contentId: string, approve: Record<string, boolean>) {
    return contentRepository.updateApproval(contentId, approve);
  },

  async updateContentTitle(contentId: string, newTitle: string): Promise<ContentDTO> {
    const content = await ContentModel.findById(contentId);

    if (!content) {
      throw new Error('Content not found');
    }

    content.title = newTitle;
    await content.save();

    sectionRepository.updateContentInSection(contentId, newTitle);

    return content.toDto();
  },

  async updateContent(contentId: string, title: string, visibility: boolean): Promise<ContentDTO> {
    const content = await ContentModel.findById(contentId);

    if (!content) {
      throw new Error('Content not found');
    }

    content.title = title;
    content.visible = visibility;
    await content.save();

    return content.toDto();
  },

  async deleteContent(contentId: string): Promise<void> {
    const content = await ContentModel.findById(contentId);

    if (!content) {
      throw new Error('Content not found');
    }
    return contentRepository.deleteContent(contentId, content.sectionId);
  },

  async updateGeneratedContent(contentId: string, contentType: string, newContent: string): Promise<ContentDTO> {
    const content = await ContentModel.findById(contentId);

    if (!content) {
      throw new Error('Content not found');
    }

    const generatedContent = content.generated?.find((item) => item.type === contentType);

    if (!generatedContent) {
      throw new Error('Generated content not found');
    }

    generatedContent.content = newContent;
    await content.save();

    return content.toDto();
  },

  async updateAudio(contentId: string, newContent: any[]): Promise<ContentDTO> {
    const content = await ContentModel.findById(contentId);

    if (!content) {
      throw new Error('Content not found');
    }

    const generatedContent = content.generated?.find((item) => item.type === 'SPEECH');

    if (!generatedContent) {
      throw new Error('Generated content not found');
    }

    generatedContent.content = newContent;
    //generatedContent.content.status = 'PENDING_AUDIO';
    content.status = 'PENDING_AUDIO';
    await content.save();

    return content.toDto();
  },

  async regenerateContent(contentId: string): Promise<ContentDTO> {
    const content = await ContentModel.findById(contentId);

    if (!content) {
      throw new Error('Content not found');
    }

    content.status = 'RETRY';

    await content.save();

    return content.toDto();
  },

  async updateProcessedContent(
    contentId: string,
    generatedData: {
      summary?: string;
      mindMap?: any;
      gamification?: any;
      speech?: any;
    }
  ): Promise<ContentDTO> {
    const content = await ContentModel.findById(contentId);

    if (!content) {
      throw new Error('Content not found');
    }

    // Actualizar cada tipo de contenido generado si existe
    if (generatedData.summary !== undefined) {
      const summaryContent = content.generated?.find((item) => item.type === 'SUMMARY');
      if (summaryContent) {
        summaryContent.content = generatedData.summary;
      }
    }

    if (generatedData.mindMap !== undefined) {
      const mindMapContent = content.generated?.find((item) => item.type === 'MIND_MAP');
      if (mindMapContent) {
        mindMapContent.content = generatedData.mindMap;
      }
    }

    if (generatedData.gamification !== undefined) {
      const gamificationContent = content.generated?.find((item) => item.type === 'GAMIFICATION');
      if (gamificationContent) {
        gamificationContent.content = generatedData.gamification;
      }
    }

    if (generatedData.speech !== undefined) {
      const speechContent = content.generated?.find((item) => item.type === 'SPEECH');
      if (speechContent) {
        speechContent.content = generatedData.speech;
      }
    }

    // Verificar si todo el contenido ha sido generado
    const allGenerated = content.generated?.every((item) => {
      return item.content !== '' && item.content !== null && item.content !== undefined;
    });

    // Actualizar el estado a COMPLETED si todo está generado
    if (allGenerated) {
      content.status = 'COMPLETED';
    }

    await content.save();

    return content.toDto();
  },

  /**
   * Procesa automáticamente el contenido después de subirlo
   * Esta función se ejecuta en background sin bloquear la respuesta
   */
  async autoProcessContent(contentId: string, connectorUrl: string, instituteId: string): Promise<void> {
    try {
      // Esperar un momento para asegurar que el archivo esté en S3
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Llamar al connector externo para que procese el contenido
      const response = await fetch(connectorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          institution_id: instituteId,
          entity: 'content',
          entity_id: contentId,
          origin: 'adaptaria',
          method: 'create',
        }),
      });

      if (response.ok) {
        // Aquí puedes agregar lógica adicional si el connector responde con los datos procesados
        const data = await response.json();

        // Si el connector devuelve los datos procesados directamente, actualizarlos
        if (data && (data.summary || data.mindMap || data.gamification || data.speech)) {
          await contentService.updateProcessedContent(contentId, {
            summary: data.summary,
            mindMap: data.mindMap,
            gamification: data.gamification,
            speech: data.speech,
          });
        }
      }
    } catch (error) {
      console.error(`[ContentService] - Failed to auto-process content ${contentId}:`, error);
      // No lanzar el error para no afectar el flujo principal
    }
  },
};
