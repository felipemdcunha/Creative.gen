import React, { useEffect, useState, useRef } from 'react';
import { AdConcept, AdAsset, CreativeSet, GenerationConfig, Persona, QueueItem, CreativeIdea } from '../types';
import { generateCreativeIdea, generateCreativeImage } from '../services/geminiService';
import { generateTrackingCode } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface Props {
  queue: QueueItem[];
  setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
  creativeSet: CreativeSet;
  persona: Persona;
  onComplete: () => void;
}

const CreativeBatchQueue: React.FC<Props> = ({ queue, setQueue, creativeSet, persona, onComplete }) => {
  const [processingIndex, setProcessingIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [logos, setLogos] = useState<{dev?: string, org?: string}>({});

  useEffect(() => {
    const fetchLogos = async () => {
       let devLogo = '';
       let orgLogo = '';

       if (creativeSet.development_id) {
           const { data } = await supabase.from('developments').select('logo_url').eq('id', creativeSet.development_id).single();
           if (data) devLogo = data.logo_url;
       }

       try {
           const { data: { user } } = await supabase.auth.getUser();
           if (user && user.email) {
               const { data: profile } = await supabase.from('profiles').select('organization_id').eq('email', user.email).single();
               if (profile && profile.organization_id) {
                   const { data: org } = await supabase.from('organizations').select('logo_url').eq('id', profile.organization_id).single();
                   if (org) orgLogo = org.logo_url;
               }
           }
       } catch (err) {
           console.error("Error fetching logo chain:", err);
       }
       setLogos({ dev: devLogo, org: orgLogo });
    };
    fetchLogos();
  }, [creativeSet]);


  useEffect(() => {
    if (queue.length > 0 && !isProcessing && processingIndex < queue.length) {
      processQueueItem(processingIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, processingIndex, isProcessing]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [processingIndex, queue]);

  const updateItemStatus = (index: number, updates: Partial<QueueItem>) => {
    setQueue(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const processQueueItem = async (index: number) => {
    setIsProcessing(true);
    const item = queue[index];

    try {
      // --- FLOW: NEW CONCEPT GENERATION ---
      if (item.type === 'new_concept' && item.config) {
          
          // 1. GENERATE BLUEPRINT (Copy, Strategy, Prompts)
          updateItemStatus(index, { status: 'generating_copy' });
          const idea = await generateCreativeIdea(creativeSet, persona, item.config);
          
          // 2. SAVE CONCEPT TO DB
          updateItemStatus(index, { status: 'saving_concept', generatedIdea: idea });
          
          const internalName = generateTrackingCode(creativeSet.name, persona.name);
          const urlTags = `utm_source=meta_ads&utm_medium=paid_social&utm_campaign=${internalName}&utm_content=${item.config.funnelStage}`;

          // Profile Check
          const { data: { user } } = await supabase.auth.getUser();
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('email', user?.email).single();
          
          let dbCta = 'LEARN_MORE';
          if (idea.copy.cta_type_meta) {
              if (idea.copy.cta_type_meta.toUpperCase().includes('WHATSAPP')) dbCta = 'WHATSAPP_MESSAGE';
              else if (idea.copy.cta_type_meta.toUpperCase().includes('SIGN_UP')) dbCta = 'SIGN_UP';
              else if (idea.copy.cta_type_meta.toUpperCase().includes('GET_OFFER')) dbCta = 'GET_OFFER';
          }

          // Force truncation before save to avoid DB constraints (max 30)
          const safeDescription = (idea.copy.description_meta || "Saiba mais agora").substring(0, 30);

          const newConcept: Partial<AdConcept> = {
              development_id: creativeSet.development_id, 
              persona_id: persona.id,
              organization_id: profile?.organization_id,
              internal_name: internalName,
              url_tags: urlTags,
              primary_text: idea.copy.primary_text_meta || "Confira essa oportunidade!",
              headline: idea.copy.headline_art || "Lançamento Exclusivo", 
              description: safeDescription,
              call_to_action_type: dbCta as any,
              funnel_stage: item.config.funnelStage,
              status: 'draft',
              created_at: new Date().toISOString()
          };

          const { data: savedConcept, error: conceptError } = await supabase
              .from('ad_concepts')
              .insert(newConcept)
              .select()
              .single();

          if (conceptError) throw conceptError;

          // 3. GENERATE ASSETS (IMAGES) - PARALLEL GENERATION STRATEGY
          updateItemStatus(index, { 
              status: 'generating_assets', 
              resultConcept: savedConcept as AdConcept,
              totalAssets: item.config.formats.length,
              completedAssets: 0
          });

          // --- PREPARE REFERENCES (The Amenity Photo is King) ---
          const initialReferenceImages: string[] = [];
          let selectedReferenceUrl: string | undefined = undefined;
          
          // 1. Check if user explicitly selected images in the modal
          if (item.config.selectedImageIds && item.config.selectedImageIds.length > 0) {
              try {
                  if (item.config.sourceType === 'amenities') {
                      const { data: images } = await supabase
                          .from('development_amenity_images')
                          .select('url')
                          .in('id', item.config.selectedImageIds);
                      if (images) {
                          images.forEach(img => initialReferenceImages.push(img.url));
                          selectedReferenceUrl = images[0]?.url;
                      }
                  } else {
                      const { data: images } = await supabase
                          .from('gallery_amplified')
                          .select('generated_image_url, original_image_url')
                          .in('id', item.config.selectedImageIds);
                      if (images) {
                          images.forEach(img => {
                              const url = img.generated_image_url || img.original_image_url;
                              if (url) initialReferenceImages.push(url);
                          });
                          selectedReferenceUrl = initialReferenceImages[0];
                      }
                  }
              } catch (err) {
                  console.error("Error fetching selected reference images:", err);
              }
          }

          // 2. Fallback to AI-selected amenity if no explicit selection OR if we want to combine them
          if (initialReferenceImages.length === 0 && idea.selected_amenity_id && creativeSet.development_id) {
               const { data } = await supabase
                  .from('development_amenity_images')
                  .select('url')
                  .eq('amenity_id', idea.selected_amenity_id);

               if (data && data.length > 0) {
                   // Pick one randomly if multiple exist for the amenity
                   const randomImg = data[Math.floor(Math.random() * data.length)];
                   if (randomImg.url) {
                       initialReferenceImages.push(randomImg.url);
                       selectedReferenceUrl = randomImg.url;
                   }
               } else {
                   // Fallback to gallery if no amenity images found
                   const { data: galleryData } = await supabase
                      .from('gallery_amplified')
                      .select('generated_image_url, original_image_url')
                      .eq('amenity_id', idea.selected_amenity_id)
                      .eq('development_id', creativeSet.development_id);

                   if (galleryData && galleryData.length > 0) {
                       const randomImg = galleryData[Math.floor(Math.random() * galleryData.length)];
                       const validUrl = randomImg.generated_image_url || randomImg.original_image_url;
                       if (validUrl) {
                           initialReferenceImages.push(validUrl);
                           selectedReferenceUrl = validUrl;
                       }
                   }
               }
          }

          // Logos (Added to reference array so the model can see them)
          if (item.config.includeDevLogo && logos.dev) initialReferenceImages.push(logos.dev);
          if (item.config.includeOrgLogo && logos.org) initialReferenceImages.push(logos.org);
          if (item.config.includeAdditionalLogo && creativeSet.additional_logo_url) initialReferenceImages.push(creativeSet.additional_logo_url);
          
          let completedCount = 0;

          // Iterate through requested formats
          for (const format of item.config.formats) {
              
              let base64Image = '';
              let usedPrompt = '';

              // --- SELECT SPECIFIC PROMPT FOR FORMAT ---
              let formatPrompt = idea.nano_banana_prompts.square_1_1; // Fallback
              if (format === '9:16' && idea.nano_banana_prompts.vertical_9_16) {
                  formatPrompt = idea.nano_banana_prompts.vertical_9_16;
              } else if (format === '16:9' && idea.nano_banana_prompts.landscape_16_9) {
                  formatPrompt = idea.nano_banana_prompts.landscape_16_9 || formatPrompt;
              }

              // --- CONSTRUCT FULL VISUAL INSTRUCTION ---
              // Combining Copy + Design + Template + Preservation Rule
              const fullPrompt = `
              TEMPLATE: ${idea.design_blueprint.template_id}
              VISUAL STYLE: ${idea.design_blueprint.visual_style}
              
              TEXT TO INCLUDE (MUST BE LEGIBLE):
              - HEADLINE: "${idea.copy.headline_art}"
              - CTA BUTTON: "${idea.copy.cta_text_art || 'Saiba Mais'}"
              ${idea.copy.subheadline_art ? `- SUB: "${idea.copy.subheadline_art}"` : ''}
              
              PRESERVATION RULE:
              - Use the provided reference image as the absolute base.
              - DO NOT change the architecture, furniture layout, or environment.
              - Only add the graphic overlays, lighting adjustments, and text as requested.
              
              SPECIFIC SCENE INSTRUCTION:
              ${formatPrompt}
              `;

              usedPrompt = fullPrompt;

              // --- GENERATE ---
              // We ALWAYS pass the 'initialReferenceImages' (The Amenity).
              // We do NOT pass the previously generated image.
              // This ensures high quality for every format.
              base64Image = await generateCreativeImage(fullPrompt, initialReferenceImages, format, false);
              
              // Upload
              const fileName = `${persona.id}/${savedConcept.id}_${format}_${Date.now()}.png`;
              const byteCharacters = atob(base64Image);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' });
              
              const { error: uploadError } = await supabase.storage.from('ad-creatives').upload(fileName, blob, { contentType: 'image/png' });
              if (uploadError) throw uploadError;

              const publicUrl = supabase.storage.from('ad-creatives').getPublicUrl(fileName).data.publicUrl;

              const assetType = (format === '9:16') ? 'STORY_IMAGE' : 'FEED_IMAGE';

              // Save Asset
              const newAsset: Partial<AdAsset> = {
                  concept_id: savedConcept.id,
                  image_url: publicUrl,
                  asset_type: assetType,
                  aspect_ratio: format,
                  prompt_used: usedPrompt,
                  reference_image_url: selectedReferenceUrl, 
                  created_at: new Date().toISOString()
              };

              const { error: assetError } = await supabase.from('ad_assets').insert(newAsset);
              if (assetError) throw assetError;

              completedCount++;
              updateItemStatus(index, { completedAssets: completedCount });
          }

          updateItemStatus(index, { status: 'completed' });
      }

      // --- FLOW: EDIT ASSET (Preserved existing logic) ---
      if (item.type === 'edit_asset' && item.sourceAsset && item.editInstruction) {
           updateItemStatus(index, { status: 'generating_assets' });
           
           const imageUrls = [item.sourceAsset.image_url];
           if (item.editReferenceImages) imageUrls.push(...item.editReferenceImages);

           const base64Image = await generateCreativeImage(item.editInstruction, imageUrls, item.sourceAsset.aspect_ratio, true);

            // Upload
            const fileName = `${persona.id}/edited_${Date.now()}.png`;
            const byteCharacters = atob(base64Image);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' });

            const { error: uploadError } = await supabase.storage.from('ad-creatives').upload(fileName, blob, { contentType: 'image/png' });
            if (uploadError) throw uploadError;

            const publicUrl = supabase.storage.from('ad-creatives').getPublicUrl(fileName).data.publicUrl;

            // Save NEW Asset linked to SAME Concept
            const newAsset: Partial<AdAsset> = {
                concept_id: item.sourceAsset.concept_id,
                image_url: publicUrl,
                asset_type: item.sourceAsset.asset_type,
                aspect_ratio: item.sourceAsset.aspect_ratio,
                prompt_used: item.editInstruction,
                reference_image_url: item.sourceAsset.reference_image_url,
                created_at: new Date().toISOString()
            };

            const { error: assetError } = await supabase.from('ad_assets').insert(newAsset);
            if (assetError) throw assetError;

            updateItemStatus(index, { status: 'completed' });
      }

    } catch (err: any) {
      console.error(err);
      updateItemStatus(index, { status: 'error', error: err.message || 'Unknown error' });
    } finally {
      setIsProcessing(false);
      if (index + 1 < queue.length) {
        setProcessingIndex(index + 1);
      } else {
        setTimeout(onComplete, 1500); 
      }
    }
  };

  const getStatusLabel = (item: QueueItem) => {
    switch(item.status) {
      case 'pending': return 'Aguardando...';
      case 'generating_copy': return 'Estratégia + Copy (Blueprint)...';
      case 'saving_concept': return 'Salvando Blueprint...';
      case 'generating_assets': 
        return item.totalAssets 
            ? `Gerando Artes Finais (${item.completedAssets}/${item.totalAssets})...` 
            : 'Gerando Imagem...';
      case 'completed': return 'Concluído';
      case 'error': return 'Falha';
      default: return '';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white shadow-2xl rounded-xl border border-gray-200 overflow-hidden z-40 flex flex-col max-h-[500px]">
      <div className="bg-gray-900 text-white p-3 flex justify-between items-center">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          Processando Batch ({processingIndex + 1}/{queue.length})
        </h3>
        <button className="text-xs text-gray-400 hover:text-white">Minimizar</button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-0" ref={scrollRef}>
        {queue.map((item, idx) => (
          <div key={item.id} className={`p-3 border-b text-sm flex flex-col gap-2 ${idx === processingIndex ? 'bg-blue-50' : ''}`}>
            <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded bg-gray-100 flex items-center justify-center font-bold text-xs text-gray-500">
                {item.type === 'new_concept' ? 'NEW' : 'EDIT'}
                </div>
                <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate flex items-center gap-2">
                    {item.type === 'new_concept' ? `Conceito #${idx + 1}` : 'Editando Asset'}
                    {item.config?.funnelStage && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase border ${
                            item.config.funnelStage === 'top' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            item.config.funnelStage === 'middle' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                            'bg-emerald-50 text-emerald-600 border-emerald-100'
                        }`}>
                            {item.config.funnelStage === 'top' ? 'Topo' :
                             item.config.funnelStage === 'middle' ? 'Meio' :
                             'Fundo'}
                        </span>
                    )}
                </p>
                <p className={`text-xs truncate ${item.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                    {item.error ? item.error : getStatusLabel(item)}
                </p>
                </div>
                <div className="flex-shrink-0">
                {item.status === 'completed' && <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                {item.status === 'error' && <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                {(item.status !== 'completed' && item.status !== 'error' && item.status !== 'pending') && (
                    <svg className="animate-spin w-5 h-5 text-brand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                )}
                </div>
            </div>
            
            {/* Show generated headline preview if available */}
            {item.generatedIdea && (
                <div className="text-xs bg-gray-100 p-2 rounded text-gray-600 italic border-l-2 border-brand">
                    "{item.generatedIdea.copy.headline_art}"
                </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-2 bg-gray-50 text-xs text-center text-gray-400 border-t">
        Gerando Conceitos e Assets
      </div>
    </div>
  );
};

export default CreativeBatchQueue;