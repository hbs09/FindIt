import { supabase } from '../supabase';

export async function sendNotification(toUserId: string, title: string, body: string) {
    if (!toUserId) return;

    const { error } = await supabase.from('notifications').insert({
        user_id: toUserId,
        title: title,
        body: body,
        read: false
    });

    if (error) console.error('Erro ao enviar notificação:', error);
}