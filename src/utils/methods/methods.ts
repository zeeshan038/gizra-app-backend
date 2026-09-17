
//NPM Packages
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

//Constants
const prisma = new PrismaClient();


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

    // Save token in database
    await prisma.vendors.update({
      where: { id: vendor.id },
      data: { auth_token: token }
    });

    let topic = 'No_topic_found';
    if (restaurant?.zone_id) {
        const zone = await prisma.zones.findUnique({
            where: { id: BigInt(restaurant.zone_id.toString()) }
        });
        if (zone?.restaurant_wise_topic) {
            topic = zone.restaurant_wise_topic;
        }
    }
    return {
        token,
        zone_wise_topic: topic
    }
    
}