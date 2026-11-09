
//NPM Packages
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';
import { getVendorFcmSubscribeTopics } from '../vendor/pushTopics';

//Generate Token
export const genrateToken = async (vendor: any, restaurant: any, JWT_SECRET: string) => {

    // Generate JWT Token
    const token = jwt.sign(
      { 
        id: vendor.id.toString(), 
        email: vendor.email, 
        role: 'vendor',
        restaurant_id: restaurant?.id?.toString()
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    let topic = 'No_topic_found';
    if (restaurant?.zone_id) {
        const zone = await prisma.zones.findUnique({
            where: { id: BigInt(restaurant.zone_id.toString()) }
        });
        if (zone?.restaurant_wise_topic) {
            topic = zone.restaurant_wise_topic;
        }
    }
    const restaurantId = restaurant?.id != null ? Number(restaurant.id) : null;
    const fcm_topics = getVendorFcmSubscribeTopics(restaurantId);
    const restaurant_message_topic = fcm_topics[0] ?? null;

    return {
        token,
        zone_wise_topic: topic,
        /** Subscribe in Firebase Messaging — new orders are sent here (not zone_wise_topic). */
        restaurant_message_topic,
        fcm_topics,
    };
}