import React, { useState, useEffect } from 'react';
import { CreativeSet, Persona, GenerationConfig, QueueItem, AdConcept, AdAsset } from '../types';
import { supabase } from '../lib/supabase';
import { fileToBase64 } from '../lib/utils';
import CreativeGeneratorModal from './CreativeGeneratorModal';
import CreativeBatchQueue from './CreativeBatchQueue';
import { Trash2, Edit, Check, Send, AlertCircle, Loader2, X } from 'lucide-react';

interface Props {
  creativeSet: CreativeSet;
  persona: Persona;
  onBack: () => void;
}

const PersonaDashboard: React.FC<Props> = ({ creativeSet, persona, onBack }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'approved' | 'published'>('all');
  const [concepts, setConcepts] = useState<AdConcept[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  
  // Edit State (Now works on Asset Level)
  const [editingAsset, setEditingAsset] = useState<AdAsset | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editFilePreviews, setEditFilePreviews] = useState<string[]>([]);

  // Lightbox State
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Custom Confirmation Modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'concept' | 'asset';
    target: any;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchConcepts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.id]);

  const fetchConcepts = async () => {
    // 1. Fetch Concepts
    const { data: conceptsData, error: conceptsError } = await supabase
      .from('ad_concepts')
      .select('*')
      .eq('persona_id', persona.id)
      .order('created_at', { ascending: false });

    if (conceptsError || !conceptsData) return;

    // 2. Fetch Assets for these concepts
    const conceptIds = conceptsData.map(c => c.id);
    const { data: assetsData, error: assetsError } = await supabase
        .from('ad_assets')
        .select('*')
        .in('concept_id', conceptIds);
    
    if (assetsData) {
        // Merge assets into concepts
        const merged = conceptsData.map(c => ({
            ...c,
            ad_assets: assetsData.filter(a => a.concept_id === c.id)
        }));
        setConcepts(merged as AdConcept[]);
    }
  };

  const handleGenerate = (config: GenerationConfig) => {
    // Each "quantity" is a new CONCEPT
    const newQueue: QueueItem[] = [];
    
    for (let i = 0; i < config.quantity; i++) {
        newQueue.push({
            id: Math.random().toString(36).substr(2, 9),
            type: 'new_concept',
            config: config,
            status: 'pending'
        });
    }
    
    setQueue(prev => [...prev, ...newQueue]);
  };

  const openEditModal = (asset: AdAsset, e: React.MouseEvent) => {
      e.stopPropagation(); 
      setEditingAsset(asset);
      setEditInstruction('');
      setEditFiles([]);
      setEditFilePreviews([]);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const files = Array.from(e.target.files) as File[];
          setEditFiles(prev => [...prev, ...files]);
          
          const newPreviews = files.map(file => URL.createObjectURL(file));
          setEditFilePreviews(prev => [...prev, ...newPreviews]);
      }
  };

  const removeEditFile = (index: number) => {
      setEditFiles(prev => prev.filter((_, i) => i !== index));
      setEditFilePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const submitEdit = async () => {
      if (!editingAsset || !editInstruction.trim()) return;

      const referenceImages: string[] = [];
      for (const file of editFiles) {
          try {
              const base64 = await fileToBase64(file);
              referenceImages.push(base64);
          } catch (err) {
              console.error("Error converting file to base64", err);
          }
      }

      const newItem: QueueItem = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'edit_asset',
          sourceAsset: editingAsset,
          editInstruction: editInstruction,
          editReferenceImages: referenceImages,
          status: 'pending'
      };
      setQueue(prev => [...prev, newItem]);
      setEditingAsset(null);
  };

  const handleQueueComplete = () => {
    setQueue([]);
    fetchConcepts(); // Refresh list
  };

  const handleStatusChange = async (id: string, newStatus: AdConcept['status']) => {
      // Optimistic update
      setConcepts(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      
      const { error } = await supabase
        .from('ad_concepts')
        .update({ status: newStatus })
        .eq('id', id);
        
      if (error) {
        console.error("Failed to update status", error);
        fetchConcepts(); // Revert
      }
  };

  const handleDeleteConcept = (concept: AdConcept, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ type: 'concept', target: concept });
  };

  const handleDeleteAsset = (asset: AdAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ type: 'asset', target: asset });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (deleteConfirm.type === 'concept') {
        const concept = deleteConfirm.target as AdConcept;
        // 1. Delete asset files from storage
        if (concept.ad_assets && concept.ad_assets.length > 0) {
          const filePaths = concept.ad_assets.map(asset => {
            const parts = asset.image_url.split('/ad-creatives/');
            return parts.length > 1 ? parts[parts.length - 1] : null;
          }).filter(Boolean) as string[];

          if (filePaths.length > 0) {
            await supabase.storage.from('ad-creatives').remove(filePaths);
          }
        }

        // 2. Delete assets from DB
        const { error: assetsError } = await supabase.from('ad_assets').delete().eq('concept_id', concept.id);
        if (assetsError) throw assetsError;

        // 3. Delete concept from DB
        const { error: conceptError } = await supabase.from('ad_concepts').delete().eq('id', concept.id);
        if (conceptError) throw conceptError;

        setConcepts(prev => prev.filter(c => c.id !== concept.id));
      } else {
        const asset = deleteConfirm.target as AdAsset;
        // 1. Delete file from storage
        const parts = asset.image_url.split('/ad-creatives/');
        const filePath = parts.length > 1 ? parts[parts.length - 1] : null;

        if (filePath) {
          await supabase.storage.from('ad-creatives').remove([filePath]);
        }

        // 2. Delete from DB
        const { error: dbError } = await supabase.from('ad_assets').delete().eq('id', asset.id);
        if (dbError) throw dbError;

        setConcepts(prev => prev.map(c => ({
          ...c,
          ad_assets: c.ad_assets?.filter(a => a.id !== asset.id)
        })));
      }
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error("Error during deletion:", err);
      setDeleteError(err.message || 'Erro ao excluir. Verifique sua conexão ou permissões.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredConcepts = concepts.filter(c => {
    if (activeTab === 'all') return c.status !== 'archived';
    return c.status === activeTab;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
            <button onClick={onBack} className="text-sm text-gray-500 hover:text-brand mb-2 flex items-center gap-1">
                &larr; Voltar para Personas
            </button>
            <div className="flex justify-between items-start">
                <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden border-2 border-brand">
                        <img src={persona.avatar_url || `https://ui-avatars.com/api/?name=${persona.name}&background=f44563&color=fff`} alt={persona.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">{persona.name}</h1>
                        <p className="text-sm text-gray-500">{persona.advanced_data.archetype} • {persona.advanced_data.job_title}</p>
                        <div className="flex gap-2 mt-2">
                             <span className="text-xs bg-brand bg-opacity-10 text-brand px-2 py-1 rounded-full font-medium">Dor: {persona.advanced_data.pain_points.substring(0, 40)}...</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="bg-brand hover:bg-brand-hover text-white px-6 py-2.5 rounded-lg shadow-lg font-medium transition flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                        Gerar Conceitos
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 w-full flex-1">
         {/* Tabs */}
         <div className="flex border-b mb-6">
             {['all', 'approved', 'published'].map((tab) => (
                 <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-6 py-3 text-sm font-medium capitalize ${activeTab === tab ? 'border-b-2 border-brand text-brand' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                     {tab === 'all' ? 'Todos' : tab === 'approved' ? 'Aprovados' : 'Publicados'}
                 </button>
             ))}
         </div>

         {/* Grid - Concepts */}
         {filteredConcepts.length === 0 ? (
             <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                 <p className="text-gray-400 mb-4">Nenhum conceito gerado ainda.</p>
                 <button onClick={() => setIsModalOpen(true)} className="text-brand font-medium hover:underline">Gerar primeiro conceito</button>
             </div>
         ) : (
            <div className="grid grid-cols-1 gap-8">
                {filteredConcepts.map((concept) => (
                    <div key={concept.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col md:flex-row">
                        
                        {/* Copy Section (Left) */}
                        <div className="p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">{concept.url_tags.split('utm_campaign=')[1]?.split('&')[0] || 'NO-TAG'}</span>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${
                                            concept.status === 'approved' ? 'bg-green-100 text-green-700' : 
                                            concept.status === 'published' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                                        }`}>{concept.status}</span>
                                    </div>
                                    {concept.funnel_stage && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                                            concept.funnel_stage === 'top' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                            concept.funnel_stage === 'middle' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                            'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        }`}>
                                            {concept.funnel_stage === 'top' ? 'Topo (Consciência)' :
                                             concept.funnel_stage === 'middle' ? 'Meio (Consideração)' :
                                             'Fundo (Conversão)'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="space-y-4 flex-1">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Headline (Max 40)</label>
                                    <h3 className="font-bold text-gray-800 text-lg leading-tight">{concept.headline}</h3>
                                    <div className="w-full bg-gray-100 h-1 mt-1 rounded overflow-hidden">
                                        <div className={`h-full ${concept.headline.length > 40 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${(concept.headline.length/40)*100}%`}}></div>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Primary Text (Max 125)</label>
                                    <p className="text-sm text-gray-600">{concept.primary_text}</p>
                                    <div className="w-full bg-gray-100 h-1 mt-1 rounded overflow-hidden">
                                        <div className={`h-full ${concept.primary_text.length > 125 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${(concept.primary_text.length/125)*100}%`}}></div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">CTA</label>
                                    <span className="text-xs bg-brand bg-opacity-10 text-brand px-2 py-1 rounded font-mono">{concept.call_to_action_type}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-6">
                                <button 
                                    onClick={() => handleStatusChange(concept.id, 'approved')}
                                    className="flex-1 py-2 border rounded text-xs font-medium hover:bg-green-50 hover:text-green-600 transition flex items-center justify-center gap-1"
                                >
                                    <Check className="w-3 h-3" />
                                    Aprovar
                                </button>
                                <button 
                                    onClick={() => handleStatusChange(concept.id, 'published')}
                                    className="flex-1 py-2 border rounded text-xs font-medium hover:bg-blue-50 hover:text-blue-600 transition flex items-center justify-center gap-1"
                                >
                                    <Send className="w-3 h-3" />
                                    Publicar
                                </button>
                                <button 
                                    onClick={(e) => handleDeleteConcept(concept, e)}
                                    className="p-2 border rounded text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                                    title="Excluir Conceito"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Assets Gallery (Right) */}
                        <div className="p-6 md:w-2/3 bg-gray-50">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Ativos Visuais (Assets)</h4>
                            <div className="flex flex-wrap gap-4">
                                {concept.ad_assets?.map(asset => (
                                    <div key={asset.id} className="relative group w-40 flex-shrink-0">
                                        <div 
                                            className={`bg-gray-200 rounded-lg overflow-hidden cursor-pointer shadow-sm border border-gray-200 relative ${
                                                asset.aspect_ratio === '9:16' ? 'aspect-[9/16]' : asset.aspect_ratio === '4:5' ? 'aspect-[4/5]' : 'aspect-square'
                                            }`}
                                            onClick={() => setViewingImage(asset.image_url)}
                                        >
                                            <img src={asset.image_url} className="w-full h-full object-cover" alt="Asset" />
                                            
                                            {/* Edit/Delete Button Overlay */}
                                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                                <button 
                                                    onClick={(e) => openEditModal(asset, e)}
                                                    className="bg-white text-brand p-2 rounded-full hover:bg-gray-100 shadow-lg"
                                                    title="Editar este Asset"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={(e) => handleDeleteAsset(asset, e)}
                                                    className="bg-white text-red-500 p-2 rounded-full hover:bg-gray-100 shadow-lg"
                                                    title="Excluir este Asset"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-1 flex justify-between items-center px-1">
                                            <span className="text-[10px] font-mono text-gray-500">{asset.aspect_ratio}</span>
                                            <span className="text-[10px] font-bold text-gray-400">{asset.asset_type === 'STORY_IMAGE' ? 'STORIES' : 'FEED'}</span>
                                        </div>
                                    </div>
                                ))}
                                {(!concept.ad_assets || concept.ad_assets.length === 0) && (
                                    <div className="text-sm text-gray-400 italic">Gerando assets...</div>
                                )}
                            </div>
                        </div>

                    </div>
                ))}
            </div>
         )}
      </div>

      {/* Main Generator Modal */}
      <CreativeGeneratorModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onGenerate={handleGenerate}
        creativeSet={creativeSet}
        persona={persona}
      />

      {/* Edit Modal (Asset Level) */}
      {editingAsset && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg font-bold mb-2">Editar Asset ({editingAsset.aspect_ratio})</h3>
                  <div className="mb-4 bg-gray-100 p-2 rounded flex justify-center">
                      <img src={editingAsset.image_url} className="h-32 object-contain" alt="Ref" />
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                      Descreva a alteração desejada para esta imagem específica.
                  </p>
                  
                  <div className="mb-4">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Instrução</label>
                      <textarea 
                          className="w-full border rounded-lg p-3 text-sm h-24 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                          placeholder="Ex: Aumente o brilho, remova o objeto X..."
                          value={editInstruction}
                          onChange={(e) => setEditInstruction(e.target.value)}
                      />
                  </div>

                  <div className="mb-6">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Imagens de Referência Extra (Opcional)</label>
                      <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center hover:bg-gray-50 transition cursor-pointer relative">
                          <input 
                              type="file" 
                              multiple 
                              accept="image/*" 
                              onChange={handleEditFileChange}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <span className="text-sm text-brand font-medium">Upload</span>
                      </div>
                      {editFilePreviews.length > 0 && (
                          <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                              {editFilePreviews.map((src, index) => (
                                  <div key={index} className="relative w-10 h-10 flex-shrink-0 rounded overflow-hidden border">
                                      <img src={src} alt="Preview" className="w-full h-full object-cover" />
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>

                  <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingAsset(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
                      <button onClick={submitEdit} className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-hover">Gerar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Lightbox */}
      {viewingImage && (
          <div 
            className="fixed inset-0 z-[60] bg-black bg-opacity-95 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
            onClick={() => setViewingImage(null)}
          >
             <div className="relative max-w-5xl max-h-screen w-full h-full flex items-center justify-center">
                 <img 
                    src={viewingImage} 
                    alt="Full View" 
                    className="max-w-full max-h-[90vh] object-contain rounded-sm shadow-2xl"
                    onClick={(e) => e.stopPropagation()} 
                 />
                 <button onClick={() => setViewingImage(null)} className="absolute top-4 right-4 bg-white bg-opacity-20 hover:bg-opacity-40 text-white rounded-full p-2 transition">
                    <X className="w-6 h-6" />
                 </button>
             </div>
          </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm && (
          <div className="fixed inset-0 z-[70] bg-black bg-opacity-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                      <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-bold text-center mb-2">Confirmar Exclusão</h3>
                  <p className="text-sm text-gray-500 text-center mb-6">
                      {deleteConfirm.type === 'concept' 
                        ? `Tem certeza que deseja excluir o conceito "${deleteConfirm.target.internal_name}"? Todos os assets vinculados também serão apagados.`
                        : 'Tem certeza que deseja excluir este asset? Esta ação não pode ser desfeita.'}
                  </p>

                  {deleteError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-600 text-xs">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{deleteError}</span>
                      </div>
                  )}

                  <div className="flex gap-3">
                      <button 
                        onClick={() => {
                            setDeleteConfirm(null);
                            setDeleteError(null);
                        }}
                        disabled={isDeleting}
                        className="flex-1 py-2 border rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition disabled:opacity-50"
                      >
                          Cancelar
                      </button>
                      <button 
                        onClick={confirmDelete}
                        disabled={isDeleting}
                        className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                          {isDeleting ? (
                              <>
                                <Loader2 className="animate-spin h-4 w-4 text-white" />
                                Excluindo...
                              </>
                          ) : 'Excluir'}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {queue.length > 0 && (
          <CreativeBatchQueue 
            queue={queue}
            setQueue={setQueue}
            creativeSet={creativeSet}
            persona={persona}
            onComplete={handleQueueComplete}
          />
      )}
    </div>
  );
};

export default PersonaDashboard;