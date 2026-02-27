// Netlify Function para operacoes de escrita na Meta Ads API
// Criar, duplicar e atualizar campanhas, conjuntos e anuncios

const META_API_VERSION = 'v24.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Apenas POST permitido' }) };
    }

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'META_ACCESS_TOKEN nao configurado' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { action, password } = body;

        let result;

        // get-campaign-details e somente leitura, nao exige senha
        if (action === 'get-campaign-details') {
            result = await getCampaignDetails(body.campaignId, body.adAccountId, accessToken);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, ...result })
            };
        }

        // Verificar senha admin para operacoes de escrita
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456789';
        if (password !== ADMIN_PASSWORD) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Senha incorreta' }) };
        }

        switch (action) {
            case 'copy-campaign':
                result = await copyCampaign(body, accessToken);
                break;

            case 'update-campaign':
                result = await updateEntity(body.campaignId, body.updates, accessToken);
                break;

            case 'update-adset':
                result = await updateEntity(body.adsetId, body.updates, accessToken);
                break;

            case 'upload-image':
                result = await uploadImage(body, accessToken);
                break;

            case 'upload-video-chunk':
                result = await uploadVideoChunk(body, accessToken);
                break;

            default:
                return { statusCode: 400, headers, body: JSON.stringify({ error: `Action desconhecida: ${action}` }) };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, ...result })
        };

    } catch (error) {
        console.error('meta-ads-write error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};

// ==========================================
// DUPLICAR CAMPANHA
// ==========================================
async function copyCampaign(params, accessToken) {
    const { campaignId, newName, dailyBudget, startTime, endTime } = params;

    if (!campaignId) throw new Error('campaignId e obrigatorio');

    // 1. Duplicar campanha com deep_copy (copia adsets e ads)
    const copyBody = {
        deep_copy: true,
        status_option: 'PAUSED',
        access_token: accessToken
    };

    if (newName) {
        copyBody.rename_options = JSON.stringify({ rename_prefix: '' });
    }

    const copyResp = await fetch(`${META_API_BASE}/${campaignId}/copies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copyBody)
    });
    const copyData = await copyResp.json();

    if (copyData.error) throw new Error(copyData.error.message);

    // O endpoint retorna o ID no campo copied_campaign_id ou ad_object_ids
    const copiedCampaignId = copyData.copied_campaign_id
        || (copyData.ad_object_ids && copyData.ad_object_ids[0])
        || copyData.id;

    if (!copiedCampaignId) throw new Error('Falha ao obter ID da campanha copiada');

    // 2. Atualizar nome da campanha copiada (se fornecido)
    if (newName) {
        await updateEntity(copiedCampaignId, { name: newName }, accessToken);
    }

    // 3. Atualizar adsets da campanha copiada (orcamento, datas)
    const updates = {};
    if (dailyBudget) updates.daily_budget = dailyBudget;
    if (startTime) updates.start_time = startTime;
    if (endTime) updates.end_time = endTime;

    if (Object.keys(updates).length > 0) {
        // Buscar adsets da campanha copiada
        const adsetsResp = await fetch(
            `${META_API_BASE}/${copiedCampaignId}/adsets?fields=id&access_token=${accessToken}&limit=500`
        );
        const adsetsData = await adsetsResp.json();

        if (adsetsData.data && adsetsData.data.length > 0) {
            for (const adset of adsetsData.data) {
                await updateEntity(adset.id, updates, accessToken);
            }
        }
    }

    return {
        copiedCampaignId,
        message: `Campanha duplicada com sucesso`
    };
}

// ==========================================
// BUSCAR DETALHES DA CAMPANHA (para preview)
// ==========================================
async function getCampaignDetails(campaignId, adAccountId, accessToken) {
    if (!campaignId) throw new Error('campaignId e obrigatorio');

    const accountId = adAccountId
        ? (adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`)
        : null;

    // Buscar campanha
    const campResp = await fetch(
        `${META_API_BASE}/${campaignId}?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,buying_type&access_token=${accessToken}`
    );
    const campaign = await campResp.json();
    if (campaign.error) throw new Error(campaign.error.message);

    // Buscar adsets
    const adsetsResp = await fetch(
        `${META_API_BASE}/${campaignId}/adsets?fields=id,name,daily_budget,lifetime_budget,targeting,optimization_goal,destination_type,start_time,end_time,status&access_token=${accessToken}&limit=50`
    );
    const adsetsData = await adsetsResp.json();

    // Buscar ads count
    const adsResp = await fetch(
        `${META_API_BASE}/${campaignId}/ads?fields=id&access_token=${accessToken}&limit=500`
    );
    const adsData = await adsResp.json();

    return {
        campaign: {
            id: campaign.id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.effective_status || campaign.status,
            dailyBudget: campaign.daily_budget || null,
            lifetimeBudget: campaign.lifetime_budget || null,
            buyingType: campaign.buying_type
        },
        adsets: (adsetsData.data || []).map(a => ({
            id: a.id,
            name: a.name,
            dailyBudget: a.daily_budget || null,
            optimizationGoal: a.optimization_goal,
            destinationType: a.destination_type,
            startTime: a.start_time,
            endTime: a.end_time,
            status: a.status,
            targeting: a.targeting ? {
                ageMin: a.targeting.age_min,
                ageMax: a.targeting.age_max,
                genders: a.targeting.genders,
                geoLocations: a.targeting.geo_locations
            } : null
        })),
        adsCount: (adsData.data || []).length
    };
}

// ==========================================
// ATUALIZAR ENTIDADE (campanha, adset, ad)
// ==========================================
async function updateEntity(entityId, updates, accessToken) {
    if (!entityId) throw new Error('entityId e obrigatorio');

    const updateResp = await fetch(`${META_API_BASE}/${entityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...updates,
            access_token: accessToken
        })
    });
    const updateData = await updateResp.json();

    if (updateData.error) throw new Error(updateData.error.message);

    return { updated: true, entityId };
}

// ==========================================
// UPLOAD DE IMAGEM
// ==========================================

async function uploadImage(params, accessToken) {
    const { adAccountId, imageData } = params;

    if (!adAccountId) throw new Error('adAccountId e obrigatorio');
    if (!imageData) throw new Error('imageData e obrigatorio');

    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    const imgBody = new URLSearchParams();
    imgBody.append('access_token', accessToken);
    imgBody.append('bytes', imageData);

    const imgResp = await fetch(`${META_API_BASE}/${accountId}/adimages`, {
        method: 'POST',
        body: imgBody
    });
    const imgData = await imgResp.json();
    if (imgData.error) throw new Error(`Erro ao enviar imagem: ${imgData.error.message}`);

    const images = imgData.images;
    if (!images) throw new Error('Resposta inesperada da API');

    const firstKey = Object.keys(images)[0];
    const imageHash = images[firstKey].hash;
    if (!imageHash) throw new Error('Falha ao obter hash da imagem');

    return { imageHash, message: 'Imagem enviada com sucesso' };
}

// ==========================================
// UPLOAD DE VIDEO EM CHUNKS
// ==========================================
async function uploadVideoChunk(params, accessToken) {
    const { adAccountId, phase, fileSize, uploadSessionId, videoData, startOffset } = params;

    const accountId = adAccountId
        ? (adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`)
        : null;
    if (!accountId) throw new Error('adAccountId e obrigatorio');

    if (phase === 'start') {
        // Iniciar upload - retorna session ID
        const body = new URLSearchParams();
        body.append('access_token', accessToken);
        body.append('upload_phase', 'start');
        body.append('file_size', fileSize);

        const resp = await fetch(`${META_API_BASE}/${accountId}/advideos`, {
            method: 'POST',
            body: body
        });
        const data = await resp.json();
        if (data.error) throw new Error(`Erro ao iniciar upload: ${data.error.message}`);

        return {
            uploadSessionId: data.upload_session_id,
            startOffset: data.start_offset,
            endOffset: data.end_offset
        };
    }

    if (phase === 'transfer') {
        // Enviar chunk de vídeo
        const body = new URLSearchParams();
        body.append('access_token', accessToken);
        body.append('upload_phase', 'transfer');
        body.append('upload_session_id', uploadSessionId);
        body.append('start_offset', startOffset);
        body.append('video_file_chunk', videoData);

        const resp = await fetch(`${META_API_BASE}/${accountId}/advideos`, {
            method: 'POST',
            body: body
        });
        const data = await resp.json();
        if (data.error) throw new Error(`Erro ao enviar chunk: ${data.error.message}`);

        return {
            startOffset: data.start_offset,
            endOffset: data.end_offset
        };
    }

    if (phase === 'finish') {
        // Finalizar upload
        const body = new URLSearchParams();
        body.append('access_token', accessToken);
        body.append('upload_phase', 'finish');
        body.append('upload_session_id', uploadSessionId);

        const resp = await fetch(`${META_API_BASE}/${accountId}/advideos`, {
            method: 'POST',
            body: body
        });
        const data = await resp.json();
        if (data.error) throw new Error(`Erro ao finalizar upload: ${data.error.message}`);

        return {
            videoId: data.id || data.video_id
        };
    }

    throw new Error(`Phase desconhecida: ${phase}`);
}
