import type { Database } from "@/database.type";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("URL:", supabaseUrl);
console.log("KEY:", supabaseKey);

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

export default supabase;
