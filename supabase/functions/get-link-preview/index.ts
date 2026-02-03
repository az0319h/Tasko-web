import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

/**
 * URL에서 도메인 추출
 */
function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return "";
  }
}

/**
 * 상대 경로를 절대 경로로 변환
 */
function resolveUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHtmlEntities(text: string): string {
  // 일반적인 HTML 엔티티 매핑
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#x27;": "'",
    "&#x2F;": "/",
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };

  // 숫자 엔티티 디코딩 (&#x27;, &#39; 등)
  let decoded = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  // 숫자 엔티티 디코딩 (&#27; 등)
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });

  // 이름 엔티티 디코딩
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }

  return decoded;
}

/**
 * HTML에서 메타데이터 추출
 */
function extractMetadata(html: string, url: string): LinkPreviewData {
  const result: LinkPreviewData = { url };

  // 정규식으로 메타 태그 파싱
  const getMetaContent = (property: string, attribute: string = "property"): string | null => {
    const regex = new RegExp(
      `<meta[^>]*${attribute}=["']${property}["'][^>]*content=["']([^"']+)["']`,
      "i"
    );
    const match = html.match(regex);
    return match ? match[1] : null;
  };

  // Open Graph 태그 우선
  const ogTitle = getMetaContent("og:title");
  const ogDescription = getMetaContent("og:description");
  const ogImage = getMetaContent("og:image");
  const ogSiteName = getMetaContent("og:site_name");

  // Fallback: 일반 메타 태그
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const metaDescription = getMetaContent("description", "name");

  // 이미지 fallback: 첫 번째 img 태그
  let fallbackImage: string | null = null;
  if (!ogImage) {
    const imgMatch = html.match(/<img[^>]*src=["']([^"']+)["']/i);
    if (imgMatch) {
      fallbackImage = imgMatch[1];
    }
  }

  // 결과 설정
  result.title = ogTitle || titleTag || undefined;
  result.description = ogDescription || metaDescription || undefined;
  result.siteName = ogSiteName || getDomain(url) || undefined;

  // 이미지 URL 처리 (상대 경로를 절대 경로로 변환)
  const imageUrl = ogImage || fallbackImage;
  if (imageUrl) {
    result.image = resolveUrl(url, imageUrl);
  }

  // HTML 태그 제거 및 HTML 엔티티 디코딩 (XSS 방지)
  if (result.title) {
    result.title = result.title.replace(/<[^>]*>/g, "").trim();
    result.title = decodeHtmlEntities(result.title);
  }
  if (result.description) {
    result.description = result.description.replace(/<[^>]*>/g, "").trim();
    result.description = decodeHtmlEntities(result.description);
  }

  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "인증 토큰이 필요합니다." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create Supabase client with user's JWT (인증 확인용)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "인증되지 않은 사용자입니다." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "URL이 필요합니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // URL 검증 (http/https만 허용)
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return new Response(
        JSON.stringify({ error: "유효한 HTTP/HTTPS URL이 필요합니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`[get-link-preview] URL 요청: ${url}, userId=${user.id}`);

    // HTML 가져오기 (타임아웃: 10초)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // 메타데이터 추출
      const metadata = extractMetadata(html, url);

      console.log(`[get-link-preview] 메타데이터 추출 완료:`, {
        url,
        hasTitle: !!metadata.title,
        hasDescription: !!metadata.description,
        hasImage: !!metadata.image,
      });

      return new Response(JSON.stringify(metadata), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === "AbortError") {
        console.error(`[get-link-preview] 타임아웃: ${url}`);
        return new Response(
          JSON.stringify({ error: "요청 시간이 초과되었습니다." }),
          {
            status: 408,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.error(`[get-link-preview] Fetch 에러:`, fetchError);
      return new Response(
        JSON.stringify({
          error: fetchError.message || "URL을 가져올 수 없습니다.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("[get-link-preview] Edge Function 에러:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
