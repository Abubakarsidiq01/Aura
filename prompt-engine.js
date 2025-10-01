// Advanced Prompt Engineering System for Aura Vision
// This system analyzes user intent and context to provide specialized AI responses

class PromptEngine {
    constructor() {
        this.conversationHistory = new Map(); // User session histories
        this.globalStats = {
            totalImages: 0,
            totalAnalyses: 0,
            popularQueries: new Map(),
            userSessions: new Set()
        };
        
        this.initializePromptTemplates();
    }
    
    initializePromptTemplates() {
        this.basePersonality = `You are AURA, a cool and casual AI vision assistant. You're like a knowledgeable friend who's good at explaining what's in images. Keep responses short, friendly, and conversational. Use HTML markup for formatting. No emojis, but be warm and approachable.`;
        
        this.useCaseTemplates = {
            // Professional & Business Use Cases
            'general_analysis': {
                trigger: /.*/,
                prompt: `You are AURA, a casual AI that explains images briefly. 

RULES:
- Keep responses under 30 words (even shorter!)
- No headers, sections, or formal structure  
- Use HTML for DISPLAY: <strong>, <br>, <ul><li>
- Write naturally for BOTH reading AND speaking
- Avoid complex punctuation or symbols
- Be conversational and friendly
- Use casual language like talking to a friend

Respond like you're casually describing the image to a friend.`
            },
            
            'medical_analysis': {
                trigger: /medical|doctor|symptom|diagnosis|health|x-ray|scan|mri/i,
                prompt: `${this.basePersonality} You are analyzing this image in a medical context. Provide detailed observations about what you see, but always include this disclaimer: "This analysis is for informational purposes only and should not replace professional medical consultation." Focus on:
                - Visible anatomical structures or medical devices
                - Any notable patterns or anomalies you can observe
                - Relevant medical terminology where appropriate
                - Suggestions for what a medical professional should examine`
            },
            
            'architectural_analysis': {
                trigger: /building|architecture|design|structure|blueprint|construction|room|interior/i,
                prompt: `${this.basePersonality} You are analyzing this image as an architectural and design expert. Provide insights on:
                - Architectural style and design principles
                - Structural elements and materials
                - Spatial composition and flow
                - Design efficiency and functionality
                - Historical or cultural architectural context
                - Potential improvements or considerations`
            },
            
            'security_surveillance': {
                trigger: /security|surveillance|suspicious|identify|person|face|activity|monitor/i,
                prompt: `${this.basePersonality} You are analyzing this image for security and surveillance purposes. Focus on:
                - Number and positioning of individuals
                - Notable activities or behaviors
                - Environmental context and setting
                - Potential security considerations
                - Time indicators (lighting, shadows, digital displays)
                - Objects of interest or concern
                Always maintain privacy and ethical considerations in your analysis.`
            },
            
            'business_intelligence': {
                trigger: /business|market|customer|retail|store|sales|inventory|analysis/i,
                prompt: `${this.basePersonality} You are analyzing this image for business intelligence and market insights. Provide analysis on:
                - Customer behavior and demographics
                - Product placement and merchandising
                - Store layout and operational efficiency
                - Market trends and consumer patterns
                - Brand visibility and competitive positioning
                - Actionable business recommendations`
            },
            
            'educational_analysis': {
                trigger: /teach|learn|student|education|explain|homework|study|academic/i,
                prompt: `${this.basePersonality} You are analyzing this image for educational purposes. Structure your response as a comprehensive learning tool:
                - Clear, detailed explanation of what you observe
                - Educational context and background information
                - Key concepts and terminology
                - Related learning opportunities
                - Questions that encourage deeper thinking
                - Connections to broader academic subjects`
            },
            
            'technical_diagnostic': {
                trigger: /technical|diagnostic|troubleshoot|repair|maintenance|equipment|machine|error/i,
                prompt: `${this.basePersonality} You are analyzing this image for technical diagnostic purposes. Provide expert analysis on:
                - Equipment condition and status indicators
                - Potential technical issues or malfunctions
                - Maintenance requirements and recommendations
                - Safety considerations and protocols
                - Operational parameters and specifications
                - Troubleshooting steps and solutions`
            },
            
            'creative_analysis': {
                trigger: /art|creative|design|aesthetic|style|composition|color|artistic/i,
                prompt: `${this.basePersonality} You are analyzing this image from a creative and artistic perspective. Provide sophisticated analysis on:
                - Visual composition and design principles
                - Color theory and palette analysis
                - Artistic style and influences
                - Emotional impact and narrative elements
                - Technical execution and craftsmanship
                - Creative inspiration and potential applications`
            },
            
            'scientific_research': {
                trigger: /research|scientific|experiment|data|analysis|study|laboratory|specimen/i,
                prompt: `${this.basePersonality} You are analyzing this image for scientific research purposes. Provide rigorous analysis including:
                - Detailed observations using scientific methodology
                - Quantifiable measurements and patterns
                - Hypothesis generation based on visual evidence
                - Relevant scientific principles and theories
                - Experimental considerations and variables
                - Recommendations for further investigation`
            },
            
            'quality_control': {
                trigger: /quality|control|defect|inspection|manufacturing|production|standard/i,
                prompt: `${this.basePersonality} You are analyzing this image for quality control and inspection purposes. Focus on:
                - Product quality indicators and standards
                - Defects, inconsistencies, or anomalies
                - Manufacturing process indicators
                - Compliance with specifications
                - Risk assessment and impact analysis
                - Corrective action recommendations`
            }
        };
        
        this.contextEnhancers = {
            'follow_up': `Based on our previous conversation about this image, I'll provide additional insights and build upon what we've already discussed.`,
            'comparison': `I'll analyze this image in comparison to similar cases and provide comparative insights.`,
            'deep_dive': `I'll provide an in-depth, comprehensive analysis with multiple layers of insight.`,
            'quick_summary': `I'll provide a concise but thorough professional summary of the key observations.`
        };
    }
    
    analyzeUserIntent(query, sessionId) {
        // Determine the primary use case based on query content
        let detectedUseCase = 'general_analysis';
        let confidence = 0;
        
        for (const [useCase, template] of Object.entries(this.useCaseTemplates)) {
            if (template.trigger.test(query)) {
                detectedUseCase = useCase;
                confidence = 0.8;
                break;
            }
        }
        
        // Analyze conversation context
        const history = this.conversationHistory.get(sessionId) || [];
        let contextType = 'initial';
        
        if (history.length > 0) {
            contextType = 'follow_up';
            if (history.length > 3) contextType = 'deep_dive';
        }
        
        // Update global statistics
        this.updateGlobalStats(query, detectedUseCase);
        
        return {
            useCase: detectedUseCase,
            confidence,
            contextType,
            sessionHistory: history
        };
    }
    
    generatePrompt(query, sessionId, imageContext = {}) {
        // Validate query length
        if (query.length > 500) {
            query = query.substring(0, 500) + '...';
        }
        
        const analysis = this.analyzeUserIntent(query, sessionId);
        const template = this.useCaseTemplates[analysis.useCase] || this.useCaseTemplates['general_analysis'];
        
        // Keep it simple - just use the template prompt and user query
        let prompt = template.prompt || `You are AURA. Keep responses under 50 words. Be casual and direct.`;
        
        // Add the user query directly
        prompt += `\n\nUser asks: "${query}"`;
        
        return {
            engineeredPrompt: prompt,
            analysis: analysis,
            metadata: {
                useCase: analysis.useCase,
                confidence: analysis.confidence,
                contextType: 'simple',
                timestamp: new Date().toISOString(),
                queryLength: query.length
            }
        };
    }
    
    updateConversationHistory(sessionId, query, response, metadata) {
        if (!this.conversationHistory.has(sessionId)) {
            this.conversationHistory.set(sessionId, []);
        }
        
        const history = this.conversationHistory.get(sessionId);
        history.push({
            query,
            response,
            metadata,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 10 interactions per session
        if (history.length > 10) {
            history.splice(0, history.length - 10);
        }
        
        this.globalStats.userSessions.add(sessionId);
    }
    
    updateGlobalStats(query, useCase) {
        this.globalStats.totalAnalyses++;
        
        // Track popular query types
        if (this.globalStats.popularQueries.has(useCase)) {
            this.globalStats.popularQueries.set(useCase, this.globalStats.popularQueries.get(useCase) + 1);
        } else {
            this.globalStats.popularQueries.set(useCase, 1);
        }
    }
    
    incrementImageCount() {
        this.globalStats.totalImages++;
        return this.globalStats.totalImages;
    }
    
    getGlobalStats() {
        return {
            ...this.globalStats,
            activeUseCases: Object.keys(this.useCaseTemplates),
            systemStatus: 'operational'
        };
    }
}

module.exports = PromptEngine; 