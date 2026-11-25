/** Which animal carries which page. Change the mapping or the labels freely. */
export type Section = 'about' | 'sizer' | 'law' | 'contact'
export type Species = 'chicken' | 'horse' | 'sheep' | 'capybara'

export const SPECIES: Record<Species, { name: string; section: Section; page: string }> = {
  chicken: { name: 'Chicken', section: 'about', page: 'About' },
  horse: { name: 'Horse', section: 'sizer', page: 'Sizer' },
  sheep: { name: 'Sheep', section: 'law', page: 'Law pipeline' },
  capybara: { name: 'Capybara', section: 'contact', page: 'Contact' },
}

export const SPECIES_LIST = Object.keys(SPECIES) as Species[]
