import sharp from 'sharp'
import { readdir, mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const INPUT_DIR = join(__dirname, '..', 'public', 'integrations')
const OUTPUT_DIR = join(__dirname, '..', 'public', 'integrations-optimized')
const MAX_WIDTH = 200
const QUALITY = 85

async function getFileSize(filePath) {
  const stats = await stat(filePath)
  return stats.size
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

async function optimizeImages() {
  console.log('=== Image Optimization Started ===\n')

  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true })
    console.log('Created output directory:', OUTPUT_DIR)
  }

  const files = await readdir(INPUT_DIR)
  let totalOriginalSize = 0
  let totalOptimizedSize = 0
  let processedCount = 0

  for (const file of files) {
    if (!/\.(png|jpg|jpeg)$/i.test(file)) continue

    const inputPath = join(INPUT_DIR, file)
    const outputName = file.replace(/\.(png|jpg|jpeg)$/i, '.webp')
    const outputPath = join(OUTPUT_DIR, outputName)

    try {
      // Get original size
      const originalSize = await getFileSize(inputPath)
      totalOriginalSize += originalSize

      // Get image metadata
      const metadata = await sharp(inputPath).metadata()

      // Optimize and convert
      await sharp(inputPath)
        .resize(MAX_WIDTH, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .webp({ quality: QUALITY })
        .toFile(outputPath)

      // Get optimized size
      const optimizedSize = await getFileSize(outputPath)
      totalOptimizedSize += optimizedSize

      const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1)

      console.log(`✓ ${file} → ${outputName}`)
      console.log(`  Original: ${formatBytes(originalSize)} (${metadata.width}x${metadata.height})`)
      console.log(`  Optimized: ${formatBytes(optimizedSize)} (${reduction}% reduction)\n`)

      processedCount++
    } catch (error) {
      console.error(`✗ Failed to process ${file}:`, error.message)
    }
  }

  console.log('\n=== Optimization Complete ===')
  console.log(`Processed: ${processedCount} images`)
  console.log(`Total Original Size: ${formatBytes(totalOriginalSize)}`)
  console.log(`Total Optimized Size: ${formatBytes(totalOptimizedSize)}`)
  console.log(`Total Reduction: ${((1 - totalOptimizedSize / totalOriginalSize) * 100).toFixed(1)}%`)
  console.log(`Space Saved: ${formatBytes(totalOriginalSize - totalOptimizedSize)}`)
}

optimizeImages().catch(console.error)
