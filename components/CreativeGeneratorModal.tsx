import React, { useState, useEffect } from 'react';
import { GenerationConfig, CreativeSet, Persona, AmenityOption } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: GenerationConfig) => void;
  creativeSet: CreativeSet;
  persona: Persona;
}

const CreativeGeneratorModal: React.FC<Props> = ({ isOpen, onClose, onGenerate, creativeSet, persona }) => {
  const [funnelStage, setFunnelStage] = useState<'top' | 'middle' | 'bottom'>('middle');
  const [ideaType, setIdeaType] = useState<'random' | 'custom'>('random');
  const [customIdeaText, setCustomIdeaText] = useState('');
  const [formats, setFormats] = useState<('1:1' | '9:16' | '16:9')[]>(['1:1']);
  
  // Logo Configs
  const [includeDevLogo, setIncludeDevLogo] = useState(true);
  const [includeOrgLogo, setIncludeOrgLogo] = useState(true);
  const [includeAdditionalLogo, setIncludeAdditionalLogo] = useState(false);

  const [quantity, setQuantity] = useState(1);
  const [availableAmenities, setAvailableAmenities] = useState<AmenityOption[]>([]);
  const [loadingAmenities, setLoadingAmenities] = useState(false);

  // Reference Image Selection
  const [sourceType, setSourceType] = useState<'amenities' | 'gallery'>('amenities');
  const [availableImages, setAvailableImages] = useState<{id: string, url: string, category: string}[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAmenities();
      fetchImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, creativeSet.id, sourceType]);

  const fetchAmenities = async () => {
    if (!creativeSet.development_id) return;
    setLoadingAmenities(true);
    try {
      // Fetch Amenities linked to this Development
      const { data, error } = await supabase
          .from('development_amenities')
          .select('id, title')
          .eq('development_id', creativeSet.development_id);

      if (error) throw error;
      if (data) {
          setAvailableAmenities(data);
      }
    } catch (err) {
      console.error("Error fetching amenities:", err);
    } finally {
      setLoadingAmenities(false);
    }
  };

  const fetchImages = async () => {
    if (!creativeSet.development_id) return;
    setLoadingImages(true);
    try {
      if (sourceType === 'amenities') {
        // Step 1: Get amenities for this development
        const { data: amenities } = await supabase
          .from('development_amenities')
          .select('id, title')
          .eq('development_id', creativeSet.development_id);
        
        if (amenities && amenities.length > 0) {
          const amenityIds = amenities.map(a => a.id);
          // Step 2: Get images for these amenities
          const { data: images, error } = await supabase
            .from('development_amenity_images')
            .select('id, url, amenity_id')
            .in('amenity_id', amenityIds);
          
          if (error) throw error;
          if (images) {
            const mapped = images.map(img => ({
              id: img.id,
              url: img.url,
              category: amenities.find(a => a.id === img.amenity_id)?.title || 'Amenity'
            }));
            setAvailableImages(mapped);
          }
        } else {
          setAvailableImages([]);
        }
      } else {
        // Fetch from gallery_amplified
        const { data, error } = await supabase
          .from('gallery_amplified')
          .select('id, generated_image_url, original_image_url, type')
          .eq('development_id', creativeSet.development_id);
        
        if (error) throw error;
        if (data) {
          const mapped = data.map(img => ({
            id: img.id,
            url: img.generated_image_url || img.original_image_url,
            category: img.type || 'Gallery'
          }));
          setAvailableImages(mapped);
        }
      }
    } catch (err) {
      console.error("Error fetching images:", err);
    } finally {
      setLoadingImages(false);
    }
  };

  const toggleImageSelection = (id: string) => {
    setSelectedImageIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : (prev.length < 3 ? [...prev, id] : prev)
    );
  };

  const handleFormatToggle = (fmt: '1:1' | '9:16' | '16:9') => {
    setFormats(prev => prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]);
  };

  const handleGenerate = () => {
    if (formats.length === 0) return alert("Selecione pelo menos um formato.");
    const selectedContext = availableImages
      .filter(img => selectedImageIds.includes(img.id))
      .map(img => img.category);

    onGenerate({
      funnelStage,
      ideaType,
      customIdeaText,
      formats,
      includeDevLogo,
      includeOrgLogo,
      includeAdditionalLogo,
      availableAmenities, // Pass the list for AI to choose from
      quantity,
      selectedImageIds,
      sourceType,
      selectedImageContext: selectedContext
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Gerar Criativos: {persona.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Section 1: Concept */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">1. Estratégia & Ideia</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Estágio do Funil</label>
                <select 
                  className="w-full border rounded-lg p-2 bg-gray-50"
                  value={funnelStage} 
                  onChange={(e) => setFunnelStage(e.target.value as any)}
                >
                  <option value="top">Topo (Consciência)</option>
                  <option value="middle">Meio (Consideração)</option>
                  <option value="bottom">Fundo (Conversão)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Origem da Ideia</label>
                <select 
                  className="w-full border rounded-lg p-2 bg-gray-50"
                  value={ideaType}
                  onChange={(e) => setIdeaType(e.target.value as any)}
                >
                  <option value="random">IA Decide (Baseado na Persona)</option>
                  <option value="custom">Manual (Escrever Ideia)</option>
                </select>
              </div>
            </div>
            {ideaType === 'custom' && (
              <textarea 
                className="w-full border rounded-lg p-2 text-sm h-24"
                placeholder="Descreva a cena e a abordagem do anúncio..."
                value={customIdeaText}
                onChange={(e) => setCustomIdeaText(e.target.value)}
              />
            )}
          </div>

          {/* Section 2: Visual Config */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">2. Configuração Visual</h3>
            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={includeDevLogo} onChange={(e) => setIncludeDevLogo(e.target.checked)} className="text-brand rounded" />
                <span className="text-sm">Logo Empreendimento</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={includeOrgLogo} onChange={(e) => setIncludeOrgLogo(e.target.checked)} className="text-brand rounded" />
                <span className="text-sm">Logo Construtora</span>
              </label>
              
              {/* Additional Logo Checkbox - Only shows if URL exists */}
              {creativeSet.additional_logo_url && (
                <label className="flex items-center space-x-2 cursor-pointer bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    <input 
                      type="checkbox" 
                      checked={includeAdditionalLogo} 
                      onChange={(e) => setIncludeAdditionalLogo(e.target.checked)} 
                      className="text-brand rounded" 
                    />
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-blue-900">Logo Adicional</span>
                        <img src={creativeSet.additional_logo_url} alt="Logo Adicional" className="w-5 h-5 object-contain" />
                    </div>
                </label>
              )}
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Formatos a Gerar</label>
              <div className="flex space-x-4">
                {['1:1', '9:16', '16:9'].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleFormatToggle(fmt as any)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      formats.includes(fmt as any) ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Reference Images */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase">3. Imagens de Referência (Opcional)</h3>
              <div className="flex bg-gray-100 p-1 rounded-lg text-[10px] font-bold">
                <button 
                  onClick={() => setSourceType('amenities')}
                  className={`px-3 py-1 rounded-md transition ${sourceType === 'amenities' ? 'bg-white shadow-sm text-brand' : 'text-gray-400'}`}
                >
                  AMENITIES
                </button>
                <button 
                  onClick={() => setSourceType('gallery')}
                  className={`px-3 py-1 rounded-md transition ${sourceType === 'gallery' ? 'bg-white shadow-sm text-brand' : 'text-gray-400'}`}
                >
                  GALLERY
                </button>
              </div>
            </div>

            {loadingImages ? (
              <div className="h-32 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed">
                <span className="text-xs text-gray-400 animate-pulse">Carregando imagens...</span>
              </div>
            ) : availableImages.length === 0 ? (
              <div className="h-32 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed">
                <span className="text-xs text-gray-400 italic">Nenhuma imagem encontrada para este empreendimento.</span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                {availableImages.map(img => (
                  <div 
                    key={img.id} 
                    onClick={() => toggleImageSelection(img.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition ${
                      selectedImageIds.includes(img.id) ? 'border-brand ring-2 ring-brand ring-opacity-20' : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img src={img.url} className="w-full h-full object-cover" alt="Ref" />
                    <div className="absolute bottom-0 inset-x-0 bg-black bg-opacity-50 p-1">
                      <p className="text-[8px] text-white truncate text-center">{img.category}</p>
                    </div>
                    {selectedImageIds.includes(img.id) && (
                      <div className="absolute top-1 right-1 bg-brand text-white rounded-full p-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-2">Selecione até 3 imagens para servir de base visual (Preservação de Ambiente).</p>
          </div>

          {/* Info about Amenities */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
             <div className="flex items-start gap-3">
                 <div className="text-brand mt-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <div>
                    <h4 className="text-sm font-semibold text-gray-800">Seleção Inteligente de Imagens</h4>
                    <p className="text-xs text-gray-500 mt-1">
                        A IA analisará {availableAmenities.length} áreas comuns disponíveis deste empreendimento e escolherá automaticamente a melhor imagem para ilustrar o conceito do anúncio criado.
                    </p>
                    {loadingAmenities ? (
                        <span className="text-xs text-gray-400 mt-1 block">Carregando lista de áreas...</span>
                    ) : (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {availableAmenities.slice(0, 5).map(a => (
                                <span key={a.id} className="text-[10px] bg-white border px-1.5 py-0.5 rounded text-gray-500">{a.title}</span>
                            ))}
                            {availableAmenities.length > 5 && <span className="text-[10px] text-gray-400">+{availableAmenities.length - 5}</span>}
                        </div>
                    )}
                 </div>
             </div>
          </div>

           {/* Section 4: Quantity */}
           <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">4. Quantidade</h3>
            <div className="flex items-center space-x-4">
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={quantity} 
                onChange={(e) => setQuantity(Number(e.target.value))} 
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand"
              />
              <span className="font-bold text-lg w-8 text-center">{quantity}</span>
              <span className="text-sm text-gray-500">Conjuntos</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Total de imagens: {quantity * formats.length}</p>
          </div>

        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3 rounded-b-xl">
          <button onClick={onClose} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleGenerate} className="px-5 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-lg shadow-lg transform transition active:scale-95">
            Gerar {quantity * formats.length} Criativos
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreativeGeneratorModal;