import z from "zod";



const reviewSchema = z.object({
    rating: z.number().min(0, "Rating must be at least 0").max(10, "Rating must be at most 10"),
    comment: z.string().optional(),
    createdAt: z.date().default(() => new Date()),

});

const trayectConditionSchema = z.object({
    condition: z.array(z.enum(["Music", "Flexible", "No talk", "Smoking", "Pets"]))
});

export const schemas = {
    reviewSchema,
    trayectConditionSchema
};  