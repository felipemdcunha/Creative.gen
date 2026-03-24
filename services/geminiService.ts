import { GoogleGenAI, Type } from "@google/genai";
import { CreativeSet, Persona, GenerationConfig, CreativeIdea } from "../types";
import { urlToBase64 } from "../lib/utils";

// Ensure API Key is available
const getAI = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
};

export const generateCreativeIdea = async (
  set: CreativeSet,
  persona: Persona,
  config: GenerationConfig,
): Promise<CreativeIdea> => {
  const ai = getAI();
  const model = 'gemini-3-flash-preview'; // Fast text model

  const personaData = persona.advanced_data;
  const brandColors = set.brand_colors ? JSON.stringify(set.brand_colors) : JSON.stringify({ primary: "#000000", secondary: "#FFFFFF", tertiary: "#333333" });
  
  // 1. System Prompt (Strategist + Art Director)
  const systemInstruction = `
Você é um ESTRATEGISTA DE MARKETING + DIRETOR DE ARTE SÊNIOR especializado em anúncios imobiliários de alta conversão (Meta Ads).

SUA MISSÃO:
Criar um "Creative Blueprint" (Planejamento Criativo) completo para um anúncio estático.

REGRAS CRÍTICAS DE LÓGICA:
1. **Seleção de Amenity**: Escolha UMA única amenity da lista fornecida que melhor ilustre o ângulo do anúncio. Essa imagem será o "Hero Asset".
2. **Templates de Design**:
   - **Topo de Funil (Consciência)** -> Use **Template A**: Lifestyle Premium. Foco na foto, headline curta e impactante, overlay gradiente discreto.
   - **Meio de Funil (Consideração)** -> Use **Template B**: Painel "Glass". Box translúcido com benefício claro + prova social curta.
   - **Fundo de Funil (Conversão)** -> Use **Template C**: Hard Sell/Urgency. Painel sólido ou de alto contraste, oferta clara, CTA grande.
3. **Copywriting (Limites META ADS)**:
   - Primary Text: Máx 125 caracteres (Gatilho + Benefício).
   - Headline (Arte): Máx 40 caracteres (Curta e grossa).
   - Description (Meta): Máx 30 caracteres (Curto e objetivo).
   - CTA (Botão): Máx 18 caracteres.
4. **Prompt Visual (Nano Banana)**:
   - Gere prompts ESPECÍFICOS para cada formato (1:1 e 9:16).
   - **IMPORTANTE:** O prompt deve assumir que JÁ TEMOS a foto de fundo (a amenity escolhida).
   - O prompt deve focar em: "Aplicar iluminação X", "Inserir texto Y na posição Z", "Manter a arquitetura original intacta".

FORMATO DE SAÍDA: JSON estrito conforme schema.
`;

  // 2. User Prompt (The specific request)
const prompt = `
DADOS DO EMPREENDIMENTO:
${set.market_vocation}

PERSONA:
${persona.name} (Dor: ${personaData.pain_points})

ESTÁGIO DO FUNIL:
${config.funnelStage}

${config.selectedImageContext && config.selectedImageContext.length > 0 
  ? `IMAGENS DE REFERÊNCIA SELECIONADAS PELO USUÁRIO (Obrigatório usar como base):
${config.selectedImageContext.join(', ')}` 
  : `LISTA DE AMENITIES DISPONÍVEIS (Escolha UMA pelo ID):
${JSON.stringify(config.availableAmenities)}`}

PALETA DE CORES:
${brandColors}

INSTRUÇÃO:
Gere o Creative Blueprint. Defina o Template (A/B/C) adequado ao funil.
Escreva os prompts visuais para "Square 1:1" e "Vertical 9:16" sabendo que usaremos a foto da amenity escolhida (ou as selecionadas pelo usuário) como base.
`;

  // Define Schema for structured output matching the Blueprint
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      selected_amenity_id: { type: Type.STRING, description: "ID of the single amenity chosen." },
      strategy_blueprint: {
        type: Type.OBJECT,
        properties: {
          funnel_stage: { type: Type.STRING },
          angle: { type: Type.STRING },
          target_emotion: { type: Type.STRING },
          communication_goal: { type: Type.STRING },
          key_benefit: { type: Type.STRING }
        },
        required: ["funnel_stage", "angle", "key_benefit"]
      },
      copy: {
        type: Type.OBJECT,
        properties: {
          primary_text_meta: { type: Type.STRING, description: "Max 125 chars" },
          headline_art: { type: Type.STRING, description: "Max 40 chars" },
          subheadline_art: { type: Type.STRING },
          description_meta: { type: Type.STRING, description: "Max 30 chars" },
          cta_text_art: { type: Type.STRING, description: "Max 18 chars" },
          cta_type_meta: { type: Type.STRING }
        },
        required: ["primary_text_meta", "headline_art", "cta_type_meta"]
      },
      design_blueprint: {
        type: Type.OBJECT,
        properties: {
          template_id: { type: Type.STRING, enum: ["TEMPLATE_A", "TEMPLATE_B", "TEMPLATE_C"] },
          visual_style: { type: Type.STRING },
          overlay_instruction: { type: Type.STRING },
          color_usage: { type: Type.STRING }
        },
        required: ["template_id", "visual_style"]
      },
      nano_banana_prompts: {
        type: Type.OBJECT,
        properties: {
          square_1_1: { type: Type.STRING, description: "Prompt for 1:1 format. Focus on Center Composition." },
          vertical_9_16: { type: Type.STRING, description: "Prompt for 9:16 format. Focus on Safe Zones for Reels/Stories." },
          landscape_16_9: { type: Type.STRING }
        },
        required: ["square_1_1", "vertical_9_16"]
      },
      metadata: {
          type: Type.OBJECT,
          properties: {
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              reasoning: { type: Type.STRING }
          }
      }
    },
    required: ["selected_amenity_id", "strategy_blueprint", "copy", "design_blueprint", "nano_banana_prompts"]
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text) as CreativeIdea;
      
      // Safety Truncate
      if (data.copy.primary_text_meta && data.copy.primary_text_meta.length > 125) {
          data.copy.primary_text_meta = data.copy.primary_text_meta.substring(0, 122) + "...";
      }
      if (data.copy.headline_art && data.copy.headline_art.length > 40) {
          data.copy.headline_art = data.copy.headline_art.substring(0, 37) + "...";
      }
      if (data.copy.description_meta && data.copy.description_meta.length > 30) {
          data.copy.description_meta = data.copy.description_meta.substring(0, 27) + "...";
      }

      return data;
    }
    throw new Error("No text response from Gemini Idea Generator");
  } catch (error) {
    console.error("Gemini Idea Error:", error);
    throw error;
  }
};

export const generateCreativeImage = async (
  visualPrompt: string,
  referenceImages: string[], // Specifically the Amenity Image + Logos
  aspectRatio: '1:1' | '9:16' | '16:9' | '4:5',
  isEditing: boolean = false
): Promise<string> => {
  const ai = getAI();
  // Using gemini-3-pro-image-preview for high fidelity
  const model = 'gemini-3-pro-image-preview'; 

  const parts: any[] = [];

  // Map 4:5 to 1:1 fallback regarding API constraints if necessary, 
  // but let's try to handle logic in the prompt.
  let apiAspectRatio = aspectRatio;
  if (aspectRatio === '4:5') apiAspectRatio = '1:1'; 

  // Add Reference Images (The Amenity Photo is paramount)
  for (const ref of referenceImages) {
    if (!ref) continue;
    try {
      let base64Data = '';
      if (ref.startsWith('data:')) {
          base64Data = ref.split(',')[1];
      } else {
          base64Data = await urlToBase64(ref);
      }

      if (base64Data) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          });
      }
    } catch (e) {
      console.warn(`Failed to process reference image: ${ref.substring(0, 20)}...`, e);
    }
  }

  // Strict System Instruction for Image Generation
  let systemInstruction = "";
  
  if (isEditing) {
      // Logic for generic edits if needed later
      systemInstruction = "Modify the image as requested.";
  } else {
      // THE NEW STRICT LOGIC
      systemInstruction = `
      ROLE: High-End Real Estate Retoucher & Compositor.
      
      INPUT: You are provided with a REFERENCE PHOTO of a property amenity/room.
      
      STRICT RULES:
      1. **BACKGROUND PRESERVATION**: You MUST use the provided reference photo as the BACKGROUND CANVAS. 
         - DO NOT generate a new room. 
         - DO NOT change the architecture, windows, or furniture layout.
         - The reference image IS the product. Keep it real.
      
      2. **FORMAT ADAPTATION**: 
         - Use the aspect ratio ${aspectRatio}. 
         - Center the main subject of the reference photo. 
         - If the format is vertical (9:16), extend the floor/ceiling naturally if needed, but do NOT warp the room.
      
      3. **GRAPHIC OVERLAY**:
         - Apply the lighting mood described in the prompt.
         - Insert the text/headline described in the prompt in a way that is LEGIBLE (High Contrast).
         - Place logos discreetly if provided.
      `;
  }

  // Combine Prompt with specific layout instruction
  const ratioInstruction = aspectRatio === '9:16' 
    ? " (Vertical 9:16 Format - Ensure text is in safe zone, not at edges)" 
    : " (Square 1:1 Format - Balanced Central Composition)";

  parts.push({
    text: `${visualPrompt} ${ratioInstruction} \n\n ${systemInstruction}`,
  });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
            aspectRatio: apiAspectRatio as any,
            imageSize: "1K" 
        }
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Gemini Image Error:", error);
    throw error;
  }
};