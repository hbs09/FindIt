import { supabase } from '../supabase';

export async function sendNotification(toUserId: string, title: string, body: string, data: any = null) {
    if (!toUserId) return;

    const { error } = await supabase.from('notifications').insert({
        user_id: toUserId,
        title: title,
        body: body,
        read: false,
        data: data
    });

    if (error) console.error('Erro ao enviar notificação:', error);
}