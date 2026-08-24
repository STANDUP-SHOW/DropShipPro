-- Instagram et la boutique Facebook s alimentent du catalogue Meta, rempli par
-- un flux que Meta vient lire lui-meme. Ce n est pas une publication au sens des
-- autres plateformes, mais c est bien une destination de vente.
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
