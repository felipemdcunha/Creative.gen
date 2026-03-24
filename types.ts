export interface CreativeSet {
  id: string;
  name: string;
  market_vocation: string;
  brand_colors: {
    primary: string;
    secondary: string;
    tertiary: string;
  } | null;
  development_id?: string;
  additional_logo_url?: string;
  organization_id?: string;
}

export interface PersonaData {
  name: string;
  pain_points: string;
  archetype: string;
  job_title: string;
  meta_ads: {
    age_range: string;
    interests: string[];
    gender: string;
    income_level: string;
  };
  base_assets: {
    lp_headline: string;
    lp_bullets: string[];
    sales_slide_argument: string;
  };
}

export interface Persona {
  id: string;
  name: string;
  creative_set_id: string;
  advanced_data: PersonaData;
  avatar_url?: string;
}

// --- META ADS STRUCTURE ---

export interface AdAsset {
  id: string;
  concept_id: string;
  image_url: string;
  fb_image_hash?: string;
  asset_type: 'FEED_IMAGE' | 'STORY_IMAGE';
  aspect_ratio: '1:1' | '9:16' | '4:5' | '16:9';
  prompt_used: string;
  reference_image_url?: string; // URL of the gallery image used as base
  created_at: string;
}

export interface AdConcept {
  id: string;
  development_id?: string;
  persona_id: string;
  organization_id?: string;
  
  internal_name: string;
  url_tags: string;

  primary_text: string; // Max 125 chars
  headline: string;     // Max 40 chars
  description: string;  // Max 30 chars
  call_to_action_type: 'LEARN_MORE' | 'SIGN_UP' | 'GET_OFFER' | 'WHATSAPP_MESSAGE';
  link_url?: string;

  funnel_stage: 'top' | 'middle' | 'bottom';
  status: 'draft' | 'approved' | 'published' | 'archived';
  
  created_at: string;
  ad_assets?: AdAsset[];
}

// --- CREATIVE BLUEPRINT STRUCTURE (New Logic) ---

export interface CreativeIdea {
  selected_amenity_id?: string; // Critical: The single amenity chosen
  
  strategy_blueprint: {
    funnel_stage: 'top' | 'middle' | 'bottom';
    angle: string;
    target_emotion: string;
    communication_goal: string;
    key_benefit: string;
  };

  copy: {
    primary_text_meta: string; // Max 125
    headline_art: string;      // Max 40 (To be rendered on image)
    subheadline_art?: string;  // Optional short sub
    description_meta?: string; // Max 30
    cta_text_art?: string;     // Max 18 (Button on image)
    cta_type_meta: string;     // Enum for DB
  };

  design_blueprint: {
    template_id: 'TEMPLATE_A' | 'TEMPLATE_B' | 'TEMPLATE_C';
    visual_style: string;
    overlay_instruction: string; // e.g., "Glass morphism panel at bottom"
    color_usage: string;
  };

  // Specific prompts per format to avoid outpainting distortion
  nano_banana_prompts: {
    square_1_1: string;
    vertical_9_16: string;
    landscape_16_9?: string;
  };

  metadata: {
    tags: string[];
    reasoning: string;
  };
}

export interface AmenityOption {
  id: string;
  title: string;
}

export interface GenerationConfig {
  funnelStage: 'top' | 'middle' | 'bottom';
  ideaType: 'random' | 'custom';
  customIdeaText?: string;
  includeDevLogo: boolean;
  includeOrgLogo: boolean;
  includeAdditionalLogo: boolean;
  availableAmenities: AmenityOption[];
  formats: ('1:1' | '9:16' | '16:9' | '4:5')[];
  quantity: number;
  selectedImageIds?: string[];
  sourceType?: 'amenities' | 'gallery';
  selectedImageContext?: string[]; // Names/Categories of selected images
}

export interface QueueItem {
  id: string;
  type: 'new_concept' | 'regenerate_asset' | 'edit_asset';
  
  config?: GenerationConfig;
  
  sourceAsset?: AdAsset;
  sourceConcept?: AdConcept; 
  editInstruction?: string;
  editReferenceImages?: string[];

  status: 'pending' | 'generating_copy' | 'saving_concept' | 'generating_assets' | 'completed' | 'error';
  
  totalAssets?: number;
  completedAssets?: number;
  
  error?: string;
  resultConcept?: AdConcept;
  generatedIdea?: CreativeIdea;
}

export interface Development {
  id: string;
  name: string;
  logo_url: string;
}

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export interface Organization {
  id: string;
  name: string;
  logo_url: string;
}