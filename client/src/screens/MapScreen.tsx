import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';

import {
  assignEventSpace,
  fetchEventMap,
  saveEventVolunteers,
  type EventMap,
  type MapArea,
  type MapRegistration,
} from '../api/client';
import { areaLabel, MAP_IMAGE_HEIGHT, MAP_IMAGE_WIDTH, MAP_SPOTS, spotLimit, type MapSpot } from '../map/spots';
import { colors, pointer, serif } from '../theme';

const mapImage = require('../../assets/site-map.png') as ImageSourcePropType;

const SPACE_LABELS: Record<MapRegistration['spacesRequested'][number], string> = {
  'grass-generator': '10x10 grass plus generator',
  grass: '10x10 grass',
  'food-truck': 'Food truck',
  pavilion: '10x10 pavilion',
};

const AREA_COLOR: Record<MapArea, { fill: string; assigned: string; border: string }> = {
  pavilion: { fill: 'rgba(143, 183, 224, 0.35)', assigned: '#8FB7E0', border: '#3E6F9E' },
  grass: { fill: 'rgba(143, 207, 115, 0.35)', assigned: '#8FCF73', border: '#3E7A32' },
  'food-truck': { fill: 'rgba(240, 178, 122, 0.35)', assigned: '#F0B27A', border: '#C56A2D' },
};

const LEGENDS: { area: MapArea; title: string; left: number; top: number; width: number; height: number }[] = [
  { area: 'pavilion', title: 'In the Pavilion', left: 0.4, top: 28, width: 31.5, height: 38 },
  { area: 'grass', title: 'In the Grass', left: 78, top: 14, width: 21.5, height: 48 },
  { area: 'food-truck', title: 'Food trucks', left: 85.5, top: 72.8, width: 14, height: 14 },
];

export function MapScreen({
  token,
  eventId,
  onBack,
}: {
  token: string;
  eventId: string;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const mapWidth = Math.max(760, Math.min(width - 32, MAP_IMAGE_WIDTH));
  const mapHeight = (mapWidth * MAP_IMAGE_HEIGHT) / MAP_IMAGE_WIDTH;
  const [map, setMap] = useState<EventMap | null>(null);
  const [selected, setSelected] = useState<MapSpot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [volunteers, setVolunteers] = useState('');
  const editingVolunteers = useRef(false);

  const load = useCallback(() => {
    setError(null);
    fetchEventMap(token, eventId)
      .then(setMap)
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [eventId, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (map && !editingVolunteers.current) {
      setVolunteers(map.volunteers);
    }
  }, [map]);

  async function commitVolunteers() {
    const next = volunteers.trim();
    if (!map || next === map.volunteers) {
      setVolunteers(next);
      return;
    }
    setError(null);
    try {
      const saved = await saveEventVolunteers(token, eventId, next);
      setMap(saved);
      setVolunteers(saved.volunteers);
    } catch (reason: unknown) {
      setError(messageFrom(reason));
    }
  }

  const assignmentFor = useCallback(
    (spot: MapSpot) => map?.assignments.find((item) => item.area === spot.area && item.spot === spot.spot) ?? null,
    [map],
  );

  async function chooseVendor(registrationId: string | null) {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setMap(await assignEventSpace(token, eventId, selected.area, selected.spot, registrationId));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  }

  const selectedAssignment = selected ? assignmentFor(selected) : null;
  const selectedVendor = selectedAssignment
    ? map?.registrations.find((registration) => registration.id === selectedAssignment.registrationId)
    : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable accessibilityRole="button" onPress={onBack} style={pointer}>
          <Text style={styles.back}>Event</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Assign spaces
        </Text>
        {map ? <Text style={styles.subtitle}>{map.title}</Text> : null}
        <Text style={styles.note}>Click a space, then choose an unassigned vendor.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!map && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {map || error ? (
          <>
            {map ? (
              <Text style={styles.counts}>
                Pavilion {count(map, 'pavilion')}/{spotLimit('pavilion')} · Grass {count(map, 'grass')}/
                {spotLimit('grass')} · Food trucks {count(map, 'food-truck')}/{spotLimit('food-truck')}
              </Text>
            ) : null}
            <ScrollView horizontal contentContainerStyle={styles.mapScroll}>
              <View style={[styles.mapFrame, { width: mapWidth, height: mapHeight }]}>
                <Image source={mapImage} style={styles.mapImage} resizeMode="stretch" />
                {MAP_SPOTS.map((spot) => {
                  const assignment = assignmentFor(spot);
                  const vendor = assignment
                    ? map?.registrations.find((registration) => registration.id === assignment.registrationId)
                    : null;
                  const active = selected?.area === spot.area && selected.spot === spot.spot;
                  const label = vendor ? vendorLabel(vendor) : 'Empty';
                  return (
                    <Pressable
                      key={`${spot.area}-${spot.spot}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${areaLabel(spot.area)} ${spot.spot}, ${label}`}
                      onPress={() => setSelected(spot)}
                      style={[
                        styles.spot,
                        {
                          left: `${spot.left}%`,
                          top: `${spot.top}%`,
                          width: `${spot.width}%`,
                          height: `${spot.height}%`,
                        },
                        {
                          backgroundColor: assignment ? AREA_COLOR[spot.area].assigned : AREA_COLOR[spot.area].fill,
                          borderColor: active ? colors.ink : AREA_COLOR[spot.area].border,
                        },
                        active && styles.spotActive,
                        pointer,
                      ]}
                    >
                      <Text style={styles.spotNumber}>{spot.spot}</Text>
                    </Pressable>
                  );
                })}
                {LEGENDS.map((legend) => (
                  <AssignmentList
                    key={legend.area}
                    legend={legend}
                    map={map}
                    fontSize={Math.max(10, mapWidth * 0.012)}
                  />
                ))}
                {map ? (
                  <View style={styles.volunteers}>
                    <Text style={[styles.volunteerLabel, { fontSize: Math.max(11, mapWidth * 0.013) }]}>Volunteers</Text>
                    <TextInput
                      accessibilityLabel="Volunteer names"
                      value={volunteers}
                      editable={!busy}
                      onChangeText={setVolunteers}
                      onFocus={() => {
                        editingVolunteers.current = true;
                      }}
                      onBlur={() => {
                        editingVolunteers.current = false;
                        void commitVolunteers();
                      }}
                      onSubmitEditing={() => {
                        editingVolunteers.current = false;
                        void commitVolunteers();
                      }}
                      placeholder="Names, separated by commas"
                      placeholderTextColor="#8A7A3A"
                      style={[styles.volunteerInput, { fontSize: Math.max(11, mapWidth * 0.013) }]}
                    />
                  </View>
                ) : null}
              </View>
            </ScrollView>
            {selected ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>
                  {areaLabel(selected.area)} {selected.spot}
                </Text>
                <Text style={styles.body}>
                  {selectedVendor ? vendorLabel(selectedVendor) : 'No vendor assigned.'}
                </Text>
                {map ? (
                  <VendorDropdown
                    vendors={unassignedVendors(map, selected.area, selectedAssignment?.registrationId ?? null)}
                    value={selectedAssignment?.registrationId ?? null}
                    disabled={busy}
                    emptyLabel={
                      map.registrations.length === 0
                        ? 'No vendors are registered for this event.'
                        : 'Every registered vendor is already assigned.'
                    }
                    onChange={(registrationId) => {
                      void chooseVendor(registrationId);
                    }}
                  />
                ) : (
                  <Text style={styles.muted}>Assignments can be saved after the database update.</Text>
                )}
              </View>
            ) : (
              <Text style={styles.muted}>Choose a numbered space on the map.</Text>
            )}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function count(map: EventMap, area: MapArea): number {
  return map.assignments.filter((item) => item.area === area).length;
}

function vendorLabel(registration: MapRegistration): string {
  return registration.businessName || registration.name;
}

function vendorOptionLabel(registration: MapRegistration): string {
  if (!registration.businessName || registration.businessName === registration.name) {
    return registration.name;
  }
  return `${registration.name} — ${registration.businessName}`;
}

function requestedLabel(spaces: MapRegistration['spacesRequested']): string {
  if (spaces.length === 0) {
    return 'Not chosen';
  }
  const order = ['grass-generator', 'grass', 'food-truck', 'pavilion'] as const;
  return order
    .flatMap((id) => {
      const amount = spaces.filter((space) => space === id).length;
      if (amount === 0) {
        return [];
      }
      return [amount === 1 ? SPACE_LABELS[id] : `${SPACE_LABELS[id]} × ${amount}`];
    })
    .join(', ');
}

function unassignedVendors(map: EventMap, area: MapArea, currentId: string | null): MapRegistration[] {
  return map.registrations
    .filter((registration) => {
      if (registration.id === currentId) {
        return true;
      }
      const assigned = map.assignments.filter((item) => item.registrationId === registration.id).length;
      const requested = Math.max(registration.spacesRequested.length, 1);
      return assigned < requested;
    })
    .sort((left, right) => {
      const leftMatch = matchesArea(left, area) ? 0 : 1;
      const rightMatch = matchesArea(right, area) ? 0 : 1;
      if (leftMatch !== rightMatch) {
        return leftMatch - rightMatch;
      }
      return vendorLabel(left).localeCompare(vendorLabel(right));
    });
}

function matchesArea(registration: MapRegistration, area: MapArea): boolean {
  if (area === 'pavilion') {
    return registration.spacesRequested.includes('pavilion');
  }
  if (area === 'food-truck') {
    return registration.spacesRequested.includes('food-truck');
  }
  return registration.spacesRequested.includes('grass') || registration.spacesRequested.includes('grass-generator');
}

function AssignmentList({
  legend,
  map,
  fontSize,
}: {
  legend: (typeof LEGENDS)[number];
  map: EventMap | null;
  fontSize: number;
}) {
  const spots = MAP_SPOTS.filter((spot) => spot.area === legend.area).sort((left, right) => left.spot - right.spot);
  return (
    <View
      style={[
        styles.legend,
        {
          left: `${legend.left}%`,
          top: `${legend.top}%`,
          width: `${legend.width}%`,
          height: `${legend.height}%`,
        },
      ]}
    >
      <Text style={[styles.legendTitle, { fontSize: fontSize + 1 }]}>{legend.title}</Text>
      <ScrollView style={styles.legendScroll} nestedScrollEnabled>
        {spots.map((spot) => {
          const assignment = map?.assignments.find((item) => item.area === spot.area && item.spot === spot.spot);
          const vendor = assignment
            ? map?.registrations.find((registration) => registration.id === assignment.registrationId)
            : null;
          return (
            <Text
              key={spot.spot}
              numberOfLines={1}
              style={[styles.legendLine, { fontSize, lineHeight: fontSize + 3 }, !vendor && styles.legendEmpty]}
            >
              {spot.spot}. {vendor ? vendorLabel(vendor) : ''}
            </Text>
          );
        })}
      </ScrollView>
    </View>
  );
}

function VendorDropdown({
  vendors,
  value,
  disabled,
  emptyLabel,
  onChange,
}: {
  vendors: MapRegistration[];
  value: string | null;
  disabled: boolean;
  emptyLabel: string;
  onChange: (registrationId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (vendors.length === 0 && !value) {
    return <Text style={styles.muted}>{emptyLabel}</Text>;
  }
  if (Platform.OS === 'web') {
    return createElement(
      'select',
      {
        'aria-label': 'Unassigned vendors',
        disabled,
        value: value ?? '',
        onChange: (event: { target: { value: string } }) => onChange(event.target.value || null),
        style: {
          fontSize: 16,
          padding: '10px 12px',
          borderRadius: 12,
          border: `1px solid ${colors.line}`,
          backgroundColor: colors.card,
          color: colors.ink,
          width: '100%',
          maxWidth: 480,
        },
      },
      createElement('option', { value: '' }, value ? 'Remove assignment' : 'Choose a vendor'),
      ...vendors.map((vendor) =>
        createElement(
          'option',
          { key: vendor.id, value: vendor.id },
          `${vendorOptionLabel(vendor)} (${requestedLabel(vendor.spacesRequested)})`,
        ),
      ),
    );
  }
  const current = vendors.find((vendor) => vendor.id === value);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen((shown) => !shown)}
        style={[styles.dropdownButton, pointer]}
      >
        <Text style={styles.body}>{current ? vendorOptionLabel(current) : 'Choose a vendor'}</Text>
      </Pressable>
      {open
        ? vendors.map((vendor) => (
            <Pressable
              key={vendor.id}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => {
                setOpen(false);
                onChange(vendor.id);
              }}
              style={[styles.vendor, pointer]}
            >
              <Text style={styles.vendorName}>{vendorOptionLabel(vendor)}</Text>
              <Text style={styles.muted}>{requestedLabel(vendor.spacesRequested)}</Text>
            </Pressable>
          ))
        : null}
      {value ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onChange(null)}
          style={pointer}
        >
          <Text style={styles.back}>Remove assignment</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function messageFrom(reason: unknown): string {
  return reason instanceof Error && reason.message ? reason.message : 'The request failed.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  column: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    gap: 12,
  },
  back: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    ...serif,
  },
  subtitle: {
    color: colors.ink,
    fontSize: 18,
  },
  note: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  counts: {
    color: colors.ink,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBackground,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
  mapScroll: {
    paddingBottom: 4,
  },
  mapFrame: {
    position: 'relative',
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  spot: {
    position: 'absolute',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    borderWidth: 1,
  },
  spotActive: {
    borderWidth: 2,
    borderColor: '#1C1915',
  },
  spotNumber: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  legend: {
    position: 'absolute',
    backgroundColor: '#F7F7F5',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  legendTitle: {
    color: colors.ink,
    fontWeight: '700',
  },
  legendScroll: {
    flex: 1,
  },
  legendLine: {
    color: colors.ink,
  },
  legendEmpty: {
    color: colors.muted,
  },
  volunteers: {
    position: 'absolute',
    left: '22%',
    width: '56%',
    top: '91.4%',
    height: '4.4%',
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3A3',
    borderRadius: 2,
    paddingHorizontal: 6,
  },
  volunteerLabel: {
    color: '#3F3814',
    fontWeight: '700',
  },
  volunteerInput: {
    flex: 1,
    color: '#3F3814',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  panel: {
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '600',
  },
  body: {
    color: colors.ink,
    fontSize: 16,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
  },
  vendor: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 8,
    gap: 2,
  },
  vendorHere: {
    opacity: 0.55,
  },
  vendorName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
});
